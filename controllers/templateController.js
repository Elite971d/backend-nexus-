// controllers/templateController.js
const Template = require('../models/Template');

/**
 * GET /api/templates
 * Role-based template retrieval:
 * - Dialer: Only active templates where roleScope in [dialer, both]
 * - Closer: Only active templates where roleScope in [closer, both]
 * - Admin/Manager: All templates with optional filters
 */
exports.getTemplates = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const { key, roleScope, group, type, status, version } = req.query;
    
    let query = {};
    
    // Support both 'group' and 'roleScope' query params (group is alias for roleScope)
    const scopeFilter = roleScope || group;
    
    // Role-based filtering for dialers and closers
    if (userRole === 'dialer') {
      query.roleScope = { $in: ['dialer', 'both'] };
      query.status = 'active';
    } else if (userRole === 'closer') {
      query.roleScope = { $in: ['closer', 'both'] };
      query.status = 'active';
    } else {
      // Admin/Manager can see all statuses and filter
      if (scopeFilter) query.roleScope = scopeFilter;
      if (type) query.type = type;
      if (status) query.status = status;
      if (key) query.key = key;
      if (version) query.version = parseInt(version);
    }
    
    const templates = await Template.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ key: 1, version: -1, createdAt: -1 });
    
    res.json(templates);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/templates/:id
 * Get single template by ID
 */
exports.getTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Role-based visibility check
    const userRole = req.user.role;
    if (userRole === 'dialer' && !['dialer', 'both'].includes(template.roleScope)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (userRole === 'closer' && !['closer', 'both'].includes(template.roleScope)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if ((userRole === 'dialer' || userRole === 'closer') && template.status !== 'active') {
      return res.status(403).json({ error: 'Only active templates are visible' });
    }
    
    res.json(template);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/templates/key/:key
 * Get all versions of a template by key (admin/manager only)
 */
exports.getTemplateVersions = async (req, res, next) => {
  try {
    const templates = await Template.find({ key: req.params.key })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ version: -1 });
    
    res.json(templates);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/templates
 * Create new template (admin/manager only)
 * Creates as draft (version 1) or new version if parentTemplateId provided
 */
exports.createTemplate = async (req, res, next) => {
  try {
    const { parentTemplateId, ...templateData } = req.body;
    
    let version = 1;
    let parentId = null;
    
    // If creating a new version, get the latest version number
    if (parentTemplateId) {
      const parentTemplate = await Template.findById(parentTemplateId);
      if (!parentTemplate) {
        return res.status(404).json({ error: 'Parent template not found' });
      }
      
      // Find the highest version for this key
      const latestVersion = await Template.findOne({ key: parentTemplate.key })
        .sort({ version: -1 });
      
      version = latestVersion ? latestVersion.version + 1 : 1;
      parentId = parentTemplateId;
    } else {
      // Check if key already exists (for new templates)
      const existing = await Template.findOne({ key: templateData.key });
      if (existing) {
        return res.status(400).json({ 
          error: 'Template key already exists. Use parentTemplateId to create a new version.' 
        });
      }
    }
    
    const template = await Template.create({
      ...templateData,
      version,
      parentTemplateId: parentId,
      status: 'draft',
      createdBy: req.user.id,
      updatedBy: req.user.id,
      isActive: false
    });
    
    const populated = await Template.findById(template._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Template with this key and version already exists' });
    }
    if (err.message.includes('Invalid key format') || err.message.includes('does not match')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /api/templates/:id
 * Update template (admin/manager only)
 * Only allowed if status is 'draft'
 */
exports.updateTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Only draft templates can be edited
    if (template.status !== 'draft') {
      return res.status(400).json({ 
        error: 'Only draft templates can be edited. Current status: ' + template.status 
      });
    }
    
    // Prevent changing key, version, or status via update
    const { key, version, status, parentTemplateId, ...updateData } = req.body;
    
    const updated = await Template.findByIdAndUpdate(
      req.params.id,
      {
        ...updateData,
        updatedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');
    
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Template with this key and version already exists' });
    }
    next(err);
  }
};

/**
 * POST /api/templates/:id/approve
 * Approve template (admin/manager only)
 * Sets status to 'approved' and records approval
 */
exports.approveTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (template.status !== 'draft') {
      return res.status(400).json({ 
        error: `Cannot approve template with status '${template.status}'. Only draft templates can be approved.` 
      });
    }
    
    const updated = await Template.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        approvedBy: req.user.id,
        approvedAt: new Date(),
        updatedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');
    
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/templates/:id/activate
 * Activate template (admin/manager only)
 * Sets status to 'active' and archives any existing active template with same key
 */
exports.activateTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (template.status !== 'approved') {
      return res.status(400).json({ 
        error: `Cannot activate template with status '${template.status}'. Only approved templates can be activated.` 
      });
    }
    
    // Ensure only one active template per key
    await Template.ensureSingleActive(template.key, req.params.id);
    
    const updated = await Template.findByIdAndUpdate(
      req.params.id,
      {
        status: 'active',
        isActive: true,
        updatedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');
    
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/templates/:id/archive
 * Archive template (admin/manager only)
 * Sets status to 'archived'
 */
exports.archiveTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (template.status === 'archived') {
      return res.status(400).json({ error: 'Template is already archived' });
    }
    
    // If archiving an active template, ensure we don't leave the key without an active version
    if (template.status === 'active') {
      const otherActive = await Template.findOne({
        key: template.key,
        status: 'active',
        _id: { $ne: req.params.id }
      });
      
      if (!otherActive) {
        // Warn but allow - admin decision
        console.warn(`Warning: Archiving the only active template for key: ${template.key}`);
      }
    }
    
    const updated = await Template.findByIdAndUpdate(
      req.params.id,
      {
        status: 'archived',
        isActive: false,
        updatedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');
    
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/templates/:id
 * Delete template (admin only) or soft-disable
 * Prevents deletion of templates with historical use (archived templates)
 */
exports.deleteTemplate = async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { hardDelete } = req.query;
    
    if (hardDelete === 'true' && req.user.role === 'admin') {
      // Prevent deletion of archived templates (historical use)
      if (template.status === 'archived') {
        return res.status(400).json({ 
          error: 'Cannot delete archived templates. They are kept for audit/history purposes.' 
        });
      }
      
      // Hard delete (admin only)
      await Template.findByIdAndDelete(req.params.id);
      res.json({ message: 'Template deleted' });
    } else {
      // Soft disable - archive instead
      const updated = await Template.findByIdAndUpdate(
        req.params.id,
        {
          status: 'archived',
          isActive: false,
          updatedBy: req.user.id,
          updatedAt: new Date()
        },
        { new: true }
      );
      
      if (!updated) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json(updated);
    }
  } catch (err) {
    next(err);
  }
};
