// controllers/notificationController.js
const Notification = require('../models/Notification');
const User = require('../models/user');

/**
 * GET /api/notifications
 * Get notifications for current user with optional filters
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const { unread, type, limit = 50 } = req.query;
    const userId = req.user.id;

    const filter = { userId };
    if (unread === 'true') {
      filter.read = false;
    }
    if (type) {
      filter.type = type;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('entityId', 'ownerName propertyAddress name')
      .lean();

    // Get unread count
    const unreadCount = await Notification.countDocuments({ userId, read: false });

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/mark-read/:id
 * Mark a single notification as read
 */
exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.read = true;
    await notification.save();

    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications for current user as read
 */
exports.markAllRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    res.json({
      success: true,
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

