// models/Template.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    key: {
      type: String,
      required: true,
      index: true
    },
    roleScope: {
      type: String,
      enum: ['dialer', 'closer', 'both', 'admin'],
      required: true
    },
    type: {
      type: String,
      enum: [
        // Dialer types
        'script',
        'objection',
        'notes',
        'compliance',
        // Closer types
        'closer_script',
        'negotiation',
        'loi',
        'followup',
        // Buyer blast types
        'buyer_blast_sms',
        'buyer_blast_email',
        'buyer_blast_internal',
        // Shared/System types
        'system',
        'kpi',
        'training'
      ],
      required: true
    },
    title: { type: String, required: true },
    content: { type: String, required: true },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: false },
    
    // Versioning
    version: {
      type: Number,
      required: true,
      default: 1
    },
    parentTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      default: null
    },
    
    // Approval workflow
    status: {
      type: String,
      enum: ['draft', 'approved', 'active', 'archived'],
      default: 'draft',
      required: true,
      index: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Compound unique index on (key, version) - allows multiple versions of same key
templateSchema.index({ key: 1, version: 1 }, { unique: true });

// Index for querying active templates by key
templateSchema.index({ key: 1, status: 1 });

// Index for role-based queries
templateSchema.index({ roleScope: 1, status: 1 });

// Pre-save hook to validate key format and roleScope/type combination
templateSchema.pre('save', async function(next) {
  // Validate key format: {role}_{type}_{short_description}
  // Must have at least 3 parts: role, type, description
  const keyParts = this.key.split('_');
  
  if (keyParts.length < 3) {
    return next(new Error(`Invalid key format. Must follow pattern: {role}_{type}_{short_description} (minimum 3 parts)`));
  }
  
  // Extract role (first part)
  const keyRole = keyParts[0];
  
  // Validate role
  const validRoles = ['dialer', 'closer', 'both', 'admin'];
  if (!validRoles.includes(keyRole)) {
    return next(new Error(`Invalid role in key: '${keyRole}'. Must be one of: ${validRoles.join(', ')}`));
  }
  
  // Validate roleScope matches key prefix
  if (keyRole !== this.roleScope) {
    return next(new Error(`Key role prefix '${keyRole}' does not match roleScope '${this.roleScope}'`));
  }
  
  // Extract type - need to match against known types
  // Try matching from longest to shortest type names
  const validTypes = [
    'buyer_blast_sms',    // Must check longer types first
    'buyer_blast_email',
    'buyer_blast_internal',
    'closer_script',
    'script',
    'objection',
    'notes',
    'compliance',
    'negotiation',
    'loi',
    'followup',
    'system',
    'kpi',
    'training'
  ];
  
  let keyType = null;
  let typeStartIndex = 1;
  
  // Try to match multi-word types first (like 'closer_script')
  for (const type of validTypes) {
    const typeParts = type.split('_');
    if (keyParts.length >= typeParts.length + 2) { // role + type + at least one description part
      const potentialType = keyParts.slice(1, 1 + typeParts.length).join('_');
      if (potentialType === type) {
        keyType = type;
        typeStartIndex = 1 + typeParts.length;
        break;
      }
    }
  }
  
  if (!keyType) {
    // Try single-word type
    if (validTypes.includes(keyParts[1])) {
      keyType = keyParts[1];
      typeStartIndex = 2;
    }
  }
  
  if (!keyType) {
    return next(new Error(`Could not extract valid type from key: ${this.key}. Valid types: ${validTypes.join(', ')}`));
  }
  
  // Validate type matches
  if (keyType !== this.type) {
    return next(new Error(`Key type '${keyType}' does not match type '${this.type}'`));
  }
  
  // Ensure there's at least one description part after the type
  if (typeStartIndex >= keyParts.length) {
    return next(new Error(`Key must have a description part after the type. Format: {role}_{type}_{description}`));
  }
  
  // Validate roleScope + type combinations
  const validCombinations = {
    dialer: ['script', 'objection', 'notes', 'compliance'],
    closer: ['closer_script', 'negotiation', 'loi', 'followup', 'buyer_blast_sms', 'buyer_blast_email', 'buyer_blast_internal'],
    both: ['compliance', 'system', 'kpi', 'training', 'buyer_blast_sms', 'buyer_blast_email', 'buyer_blast_internal'],
    admin: ['system', 'kpi', 'training', 'buyer_blast_sms', 'buyer_blast_email', 'buyer_blast_internal']
  };
  
  if (!validCombinations[this.roleScope]?.includes(this.type)) {
    return next(new Error(`Invalid combination: roleScope '${this.roleScope}' cannot have type '${this.type}'`));
  }
  
  next();
});

// Static method to ensure only one active template per key
templateSchema.statics.ensureSingleActive = async function(key, excludeId = null) {
  const activeTemplates = await this.find({
    key,
    status: 'active',
    _id: { $ne: excludeId }
  });
  
  if (activeTemplates.length > 0) {
    // Archive all other active templates
    await this.updateMany(
      { key, status: 'active', _id: { $ne: excludeId } },
      { status: 'archived', updatedAt: new Date() }
    );
  }
};

module.exports = mongoose.model('Template', templateSchema);
