// controllers/messageController.js
const MessageThread = require('../models/MessageThread');
const Message = require('../models/Message');
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const User = require('../models/user');
const { getProvider } = require('../services/outboundProviders');
const { createNotification } = require('../services/notificationService');
const { emitToUser, emitToRoom } = require('../utils/realtime');

/**
 * GET /api/messages/threads
 * Get all message threads for current user
 */
exports.getThreads = async (req, res, next) => {
  try {
    const { unread, leadId, buyerId, channel } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build filter based on role (tenant-scoped)
    let filter = { 
      participants: userId,
      tenantId: req.user.tenantId 
    };

    // Apply filters
    if (leadId) filter.relatedLeadId = leadId;
    if (buyerId) filter.relatedBuyerId = buyerId;

    const threads = await MessageThread.find(filter)
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'name email role')
      .populate('relatedLeadId', 'ownerName propertyAddress')
      .populate('relatedBuyerId', 'name email phone')
      .lean();

    // Filter by unread and channel, and apply role-based visibility
    const filteredThreads = [];
    for (const thread of threads) {
      // Get last message for this thread
      const messageFilter = { threadId: thread._id };
      if (channel) messageFilter.channel = channel;
      
      const lastMessage = await Message.findOne(messageFilter)
        .sort({ createdAt: -1 })
        .lean();

      if (!lastMessage) continue;

      // Check if unread (user hasn't read it)
      const userRead = lastMessage.readBy?.some(r => r.userId.toString() === userId);
      const isUnread = !userRead && lastMessage.senderId?.toString() !== userId;

      if (unread === 'true' && !isUnread) continue;

      // Role-based visibility
      if (!canUserAccessThread(thread, userId, userRole)) continue;

      // Add unread status and last message
      thread.unread = isUnread;
      thread.lastMessage = lastMessage;
      thread.messageCount = await Message.countDocuments({ threadId: thread._id });

      filteredThreads.push(thread);
    }

    res.json(filteredThreads);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/messages/threads/:id
 * Get messages for a specific thread
 */
exports.getThreadMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const thread = await MessageThread.findOne({ 
      _id: id,
      tenantId: req.user.tenantId 
    })
      .populate('participants', 'name email role')
      .populate('relatedLeadId', 'ownerName propertyAddress')
      .populate('relatedBuyerId', 'name email phone');

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check access
    if (!canUserAccessThread(thread, userId, userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({ threadId: id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name email role')
      .lean();

    // Mark messages as read for current user
    await Message.updateMany(
      {
        threadId: id,
        'readBy.userId': { $ne: userId },
        senderId: { $ne: userId }
      },
      {
        $push: {
          readBy: {
            userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      thread,
      messages
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/messages/send
 * Send a message (creates thread if needed)
 * Body: { threadId?, participants?, relatedLeadId?, relatedBuyerId?, body, channel, externalAddress? }
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { threadId, participants, relatedLeadId, relatedBuyerId, body, channel, externalAddress } = req.body;

    if (!body || !channel) {
      return res.status(400).json({ error: 'Missing required fields: body, channel' });
    }

    if (!['internal', 'sms', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel. Must be internal, sms, or email' });
    }

    let thread;

    // Find or create thread
    if (threadId) {
      thread = await MessageThread.findOne({ 
        _id: threadId,
        tenantId: req.user.tenantId 
      });
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      if (!canUserAccessThread(thread, userId, userRole)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      // Create new thread
      const threadParticipants = participants || [userId];
      
      // Ensure current user is in participants
      if (!threadParticipants.includes(userId.toString())) {
        threadParticipants.push(userId.toString());
      }

      // Role-based validation
      if (!canUserCreateThread(threadParticipants, relatedLeadId, relatedBuyerId, userRole)) {
        return res.status(403).json({ error: 'Cannot create thread with these participants' });
      }

      thread = await MessageThread.create({
        tenantId: req.user.tenantId,
        participants: threadParticipants,
        relatedLeadId: relatedLeadId || null,
        relatedBuyerId: relatedBuyerId || null
      });
    }

    // Create message
    const message = await Message.create({
      tenantId: req.user.tenantId,
      threadId: thread._id,
      senderId: userId,
      senderRole: userRole,
      body,
      channel,
      externalAddress: externalAddress || null,
      inbound: false,
      readBy: [{
        userId,
        readAt: new Date()
      }]
    });

    // Update thread last message time
    thread.lastMessageAt = new Date();
    await thread.save();

    // Send via external provider if not internal
    if (channel !== 'internal') {
      try {
        const provider = getProvider(channel);
        if (provider.isConfigured()) {
          // Determine recipient
          let recipient = null;
          if (externalAddress) {
            recipient = externalAddress;
          } else if (relatedBuyerId) {
            const buyer = await Buyer.findById(relatedBuyerId);
            if (channel === 'sms' && buyer?.phones?.length > 0) {
              recipient = buyer.phones[0];
            } else if (channel === 'email' && buyer?.emails?.length > 0) {
              recipient = buyer.emails[0];
            }
          }

          if (recipient) {
            await provider.send({
              to: recipient,
              message: body,
              metadata: {
                threadId: thread._id.toString(),
                messageId: message._id.toString(),
                leadId: relatedLeadId?.toString(),
                buyerId: relatedBuyerId?.toString()
              }
            });
          }
        }
      } catch (sendError) {
        console.error('[Message] External send failed:', sendError);
        // Don't fail the request - message is still saved
      }
    }

    // Create notifications for other participants
    for (const participantId of thread.participants) {
      if (participantId.toString() !== userId.toString()) {
        await createNotification({
          userId: participantId,
          type: 'system',
          title: 'New Message',
          message: body.substring(0, 100),
          entityType: 'message',
          entityId: message._id,
          priority: 'normal'
        });
      }
    }

    // Reload message with populated sender
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name email role')
      .lean();

    // Emit real-time event to thread participants
    for (const participantId of thread.participants) {
      if (participantId.toString() !== userId.toString()) {
        emitToUser(participantId.toString(), 'message:received', {
          threadId: thread._id,
          messageId: populatedMessage._id,
          message: populatedMessage
        });
      }
    }
    
    // Emit to thread room
    emitToRoom(`thread:${thread._id}`, 'message:received', {
      threadId: thread._id,
      messageId: populatedMessage._id,
      message: populatedMessage
    });

    res.json({
      thread,
      message: populatedMessage
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/messages/read/:id
 * Mark a message as read (alternative endpoint)
 */
exports.markMessageRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if already read
    const alreadyRead = message.readBy.some(r => r.userId.toString() === userId);
    if (!alreadyRead && message.senderId?.toString() !== userId) {
      message.readBy.push({
        userId,
        readAt: new Date()
      });
      await message.save();
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * Role-based access control helpers
 */
function canUserAccessThread(thread, userId, userRole) {
  // User must be a participant
  if (!thread.participants.some(p => p._id?.toString() === userId || p.toString() === userId)) {
    return false;
  }

  // Admin has full access
  if (userRole === 'admin') {
    return true;
  }

  // Check lead access
  if (thread.relatedLeadId) {
    // Dialers can only see leads assigned to them (simplified - would need assignment check)
    // For now, allow if user is participant
    return true;
  }

  // Check buyer access
  if (thread.relatedBuyerId) {
    // Buyers can only see their own threads
    // For internal users, allow if participant
    return true;
  }

  return true;
}

function canUserCreateThread(participants, relatedLeadId, relatedBuyerId, userRole) {
  // Admin can create any thread
  if (userRole === 'admin') {
    return true;
  }

  // Dialers cannot message buyers directly unless allowed
  if (relatedBuyerId && userRole === 'dialer') {
    // For now, allow - could add permission check
    return true;
  }

  // Closers can message buyers
  if (relatedBuyerId && (userRole === 'closer' || userRole === 'manager')) {
    return true;
  }

  // Internal messaging always allowed
  if (!relatedBuyerId || !relatedLeadId) {
    return true;
  }

  return true;
}

