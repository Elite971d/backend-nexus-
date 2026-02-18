// src/services/dealsService.js — Deal CRUD, assign, notes; audit logging; field whitelisting
const Deal = require('../../models/Deal');
const DealNote = require('../../models/DealNote');
const ActivityLog = require('../../models/ActivityLog');
const { addTenantFilter, verifyTenantOwnership } = require('../../middleware/tenantScope');
const { logActivity, ENTITY_DEAL, ENTITY_NOTE } = require('../lib/auditLog');
const {
  createDealSchema,
  updateDealSchema,
  allowedUpdateFields,
  assignDealSchema,
  addNoteSchema,
  listDealsQuerySchema,
  listActivityQuerySchema
} = require('../validators/deals');

/**
 * List deals with filters and pagination. Tenant-scoped.
 */
async function listDeals(tenantId, query) {
  const parsed = listDealsQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const { status, assignedTo, search, page, limit } = parsed.data;
  const filter = addTenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { senderName: re },
      { senderEmail: re },
      { subject: re },
      { 'property.address': re },
      { 'property.city': re },
      { 'property.state': re },
      { 'property.zip': re }
    ];
  }
  const skip = (page - 1) * limit;
  const [deals, total] = await Promise.all([
    Deal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Deal.countDocuments(filter)
  ]);
  return {
    success: true,
    data: { deals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  };
}

/**
 * Create a new deal. Sets tenantId and createdBy from context. Logs activity.
 */
async function createDeal(tenantId, actorId, body) {
  const parsed = createDealSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const payload = {
    ...parsed.data,
    tenantId,
    createdBy: actorId,
    assignedTo: parsed.data.assignedTo ?? null
  };
  const deal = await Deal.create(payload);
  await logActivity({
    tenantId,
    entityType: ENTITY_DEAL,
    entityId: deal._id,
    action: 'create',
    actorId,
    changes: parsed.data
  });
  return { success: true, data: deal };
}

/**
 * Get a single deal by id. Tenant-scoped.
 */
async function getDealById(tenantId, dealId) {
  const result = await verifyTenantOwnership(Deal, dealId, tenantId);
  if (!result.valid) return { success: false, notFound: true, error: result.error };
  return { success: true, data: result.document };
}

/**
 * Update deal with whitelisted fields only. Logs activity with changes.
 */
async function updateDeal(tenantId, actorId, dealId, body) {
  const result = await verifyTenantOwnership(Deal, dealId, tenantId);
  if (!result.valid) return { success: false, notFound: true, error: result.error };
  const parsed = updateDealSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const allowed = {};
  for (const key of allowedUpdateFields) {
    if (parsed.data[key] !== undefined) allowed[key] = parsed.data[key];
  }
  if (Object.keys(allowed).length === 0) {
    return { success: true, data: result.document };
  }
  const updated = await Deal.findByIdAndUpdate(
    dealId,
    { $set: allowed },
    { new: true }
  );
  await logActivity({
    tenantId,
    entityType: ENTITY_DEAL,
    entityId: dealId,
    action: 'update',
    actorId,
    changes: allowed
  });
  return { success: true, data: updated };
}

/**
 * Assign deal to user. Admin/manager only enforced in route. Logs activity.
 */
async function assignDeal(tenantId, actorId, dealId, body) {
  const result = await verifyTenantOwnership(Deal, dealId, tenantId);
  if (!result.valid) return { success: false, notFound: true, error: result.error };
  const parsed = assignDealSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const previous = result.document.assignedTo ? result.document.assignedTo.toString() : null;
  const next = parsed.data.assignedTo ? parsed.data.assignedTo.toString() : null;
  const updated = await Deal.findByIdAndUpdate(
    dealId,
    { $set: { assignedTo: parsed.data.assignedTo || null } },
    { new: true }
  );
  await logActivity({
    tenantId,
    entityType: ENTITY_DEAL,
    entityId: dealId,
    action: 'assign',
    actorId,
    changes: { assignedTo: { from: previous, to: next } }
  });
  return { success: true, data: updated };
}

/**
 * Add a note to a deal. Logs activity.
 */
async function addNote(tenantId, actorId, dealId, body) {
  const result = await verifyTenantOwnership(Deal, dealId, tenantId);
  if (!result.valid) return { success: false, notFound: true, error: result.error };
  const parsed = addNoteSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const note = await DealNote.create({
    tenantId,
    dealId,
    authorId: actorId,
    body: parsed.data.body
  });
  await logActivity({
    tenantId,
    entityType: ENTITY_DEAL,
    entityId: dealId,
    action: 'note_added',
    actorId,
    changes: { noteId: note._id, bodySnippet: parsed.data.body.slice(0, 200) }
  });
  return { success: true, data: note };
}

/**
 * List notes for a deal. Tenant-scoped.
 */
async function getNotes(tenantId, dealId) {
  const result = await verifyTenantOwnership(Deal, dealId, tenantId);
  if (!result.valid) return { success: false, notFound: true, error: result.error };
  const notes = await DealNote.find({ dealId, tenantId }).sort({ createdAt: -1 }).lean();
  return { success: true, data: notes };
}

/**
 * List activity log entries. Admin/manager only; filter by entityId (and optional entityType).
 */
async function listActivity(tenantId, query) {
  const parsed = listActivityQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { success: false, validation: parsed.error };
  }
  const { entityId, entityType, page, limit } = parsed.data;
  const filter = addTenantFilter({}, tenantId);
  if (entityId) filter.entityId = entityId;
  if (entityType) filter.entityType = entityType;
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actorId', 'email name').lean(),
    ActivityLog.countDocuments(filter)
  ]);
  return {
    success: true,
    data: { activity: entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  };
}

module.exports = {
  listDeals,
  createDeal,
  getDealById,
  updateDeal,
  assignDeal,
  addNote,
  getNotes,
  listActivity
};
