// utils/realtime.js
// Real-time event emission utilities for Socket.IO

let ioInstance = null;

/**
 * Initialize the Socket.IO instance (called from server.js)
 */
function setIO(io) {
  ioInstance = io;
}

/**
 * Get the Socket.IO instance
 */
function getIO() {
  return ioInstance;
}

/**
 * Emit event to a specific user
 */
function emitToUser(userId, event, payload) {
  if (!ioInstance) {
    console.warn('⚠️  Socket.IO not initialized, skipping emitToUser');
    return;
  }
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit event to all users with a specific role
 */
function emitToRole(role, event, payload) {
  if (!ioInstance) {
    console.warn('⚠️  Socket.IO not initialized, skipping emitToRole');
    return;
  }
  ioInstance.to(`role:${role}`).emit(event, payload);
}

/**
 * Emit event to all users in a specific tenant
 */
function emitToTenant(tenantId, event, payload) {
  if (!ioInstance) {
    console.warn('⚠️  Socket.IO not initialized, skipping emitToTenant');
    return;
  }
  ioInstance.to(`tenant:${tenantId}`).emit(event, payload);
}

/**
 * Emit event to a specific room
 */
function emitToRoom(room, event, payload) {
  if (!ioInstance) {
    console.warn('⚠️  Socket.IO not initialized, skipping emitToRoom');
    return;
  }
  ioInstance.to(room).emit(event, payload);
}

/**
 * Emit from request context (uses req.app.get('io'))
 */
function emitFromReq(req, event, payload) {
  const io = req.app.get('io');
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping emitFromReq');
    return;
  }
  return io;
}

module.exports = {
  setIO,
  getIO,
  emitToUser,
  emitToRole,
  emitToTenant,
  emitToRoom,
  emitFromReq
};

