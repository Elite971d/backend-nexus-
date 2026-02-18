// src/lib/auditLog.js — Write to ActivityLog for create/update/assign/note
const ActivityLog = require('../../models/ActivityLog');

const ENTITY_DEAL = 'deal';
const ENTITY_NOTE = 'deal_note';

/**
 * Append an activity log entry.
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.entityType - e.g. 'deal', 'deal_note'
 * @param {string} params.entityId - _id of the entity
 * @param {string} params.action - e.g. 'create', 'update', 'assign', 'note_added'
 * @param {string|null} params.actorId - user _id
 * @param {Object} [params.changes] - optional diff or payload for details
 */
async function logActivity({ tenantId, entityType, entityId, action, actorId = null, changes = {} }) {
  await ActivityLog.create({
    tenantId,
    entityType,
    entityId,
    action,
    actorId,
    details: { changes, timestamp: new Date() }
  });
}

module.exports = {
  logActivity,
  ENTITY_DEAL,
  ENTITY_NOTE
};
