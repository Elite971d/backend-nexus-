// services/notificationService.js
const Notification = require('../models/Notification');
const { emitToUser } = require('../utils/realtime');

/**
 * Create a notification
 * @param {Object} params - { userId, type, title, message, entityType?, entityId?, priority? }
 * @returns {Promise<Notification>}
 */
async function createNotification(params) {
  const {
    userId,
    type,
    title,
    message,
    entityType = null,
    entityId = null,
    priority = 'normal'
  } = params;

  if (!userId || !type || !title || !message) {
    console.error('[Notification] Missing required fields:', params);
    return null;
  }

  try {
    // Get tenantId from user if not provided
    let tenantId = params.tenantId;
    if (!tenantId && userId) {
      const User = require('../models/user');
      const user = await User.findById(userId).select('tenantId');
      tenantId = user?.tenantId;
    }
    
    const notification = await Notification.create({
      tenantId,
      userId,
      type,
      title,
      message,
      entityType,
      entityId,
      priority
    });
    
    // Emit real-time event
    emitToUser(userId, 'notification:created', {
      notificationId: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      priority: notification.priority,
      createdAt: notification.createdAt
    });
    
    return notification;
  } catch (err) {
    console.error('[Notification] Error creating notification:', err);
    return null;
  }
}

/**
 * Notify on dialer → closer handoff
 */
async function notifyHandoffReceived(lead, closerUserId, dialerUserId) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
  const owner = lead.ownerName || 'Unknown owner';

  await createNotification({
    userId: closerUserId,
    type: 'handoff_received',
    title: 'New Handoff Received',
    message: `${owner} - ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'high'
  });
}

/**
 * Notify when closer requests info from dialer
 */
async function notifyInfoRequested(lead, dialerUserId, requestedFields) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
  const fieldsStr = requestedFields?.join(', ') || 'additional information';

  await createNotification({
    userId: dialerUserId,
    type: 'info_requested',
    title: 'Information Requested',
    message: `Closer needs ${fieldsStr} for ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'high'
  });
}

/**
 * Notify when buyer replies YES
 */
async function notifyBuyerInterest(buyer, lead, userId) {
  const buyerName = buyer.name || 'Unknown buyer';
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';

  await createNotification({
    userId: userId,
    type: 'buyer_interest',
    title: 'Buyer Interested',
    message: `${buyerName} is interested in ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'high'
  });
}

/**
 * Notify when offer is sent
 */
async function notifyOfferSent(lead, userId, offerAmount) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
  const amountStr = offerAmount ? `$${offerAmount.toLocaleString()}` : 'offer';

  await createNotification({
    userId: userId,
    type: 'offer_sent',
    title: 'Offer Sent',
    message: `${amountStr} offer sent for ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'normal'
  });
}

/**
 * Notify when contract is sent
 */
async function notifyContractSent(lead, userId) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';

  await createNotification({
    userId: userId,
    type: 'contract_sent',
    title: 'Contract Sent',
    message: `Contract sent for ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'high'
  });
}

/**
 * Notify when skip trace completes
 */
async function notifySkipTraceComplete(lead, userId) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';

  await createNotification({
    userId: userId,
    type: 'system',
    title: 'Skip Trace Complete',
    message: `Skip trace completed for ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'normal'
  });
}

/**
 * Notify when lead matches buy box
 */
async function notifyLeadMatchesBuyBox(lead, userId, buyBoxLabel) {
  const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
  const grade = lead.leadScore?.grade || 'N/A';

  await createNotification({
    userId: userId,
    type: 'lead_assigned',
    title: 'Hot Lead Match',
    message: `${grade} lead matches ${buyBoxLabel}: ${address}`,
    entityType: 'lead',
    entityId: lead._id,
    priority: 'high'
  });
}

/**
 * Notify system errors (admin only)
 */
async function notifySystemError(adminUserIds, errorMessage, details) {
  const notifications = adminUserIds.map(userId =>
    createNotification({
      userId,
      type: 'system',
      title: 'System Error',
      message: errorMessage,
      priority: 'high',
      metadata: details
    })
  );
  await Promise.all(notifications);
}

module.exports = {
  createNotification,
  notifyHandoffReceived,
  notifyInfoRequested,
  notifyBuyerInterest,
  notifyOfferSent,
  notifyContractSent,
  notifySkipTraceComplete,
  notifyLeadMatchesBuyBox,
  notifySystemError
};

