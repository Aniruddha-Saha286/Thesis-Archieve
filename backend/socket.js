const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./middleware/auth');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Socket middleware for authentication and room assignment
  io.use((socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (rawToken) {
        try {
          const secret = getJwtSecret();
          const decoded = jwt.verify(rawToken, secret);
          socket.user = decoded;
        } catch (tokenErr) {
          // Allow connection even if token is invalid or guest, but without elevated rooms
          socket.user = null;
        }
      }
      return next();
    } catch (err) {
      return next();
    }
  });

  io.on('connection', (socket) => {
    // Join personal user room if authenticated
    if (socket.user?.id) {
      const userRoom = `user:${socket.user.id}`;
      socket.join(userRoom);
    }

    // Join admin room if administrator
    if (socket.user?.role === 'admin') {
      socket.join('role:admin');
    }

    // Client can dynamically authenticate after login
    socket.on('auth:authenticate', (token) => {
      try {
        if (!token) return;
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        socket.user = decoded;

        socket.join(`user:${decoded.id}`);
        if (decoded.role === 'admin') {
          socket.join('role:admin');
        }

        socket.emit('auth:authenticated', {
          userId: decoded.id,
          role: decoded.role,
        });
      } catch (err) {
        socket.emit('auth:error', { message: 'Invalid socket authentication token.' });
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
}

function getIO() {
  return io;
}

// -------------------------------------------------------------
// Realtime Broadcast Event Helpers
// -------------------------------------------------------------

/**
 * Broadcast when an admin approves, rejects, bans, or reinstates a student.
 */
function emitStudentStatusChanged(studentId, payload) {
  if (!io) return;
  const sId = String(studentId);
  // Send directly to the student's live session
  io.to(`user:${sId}`).emit('user:status_changed', {
    studentId: sId,
    ...payload,
  });
  // Notify all active administrators
  io.to('role:admin').emit('admin:student_updated', {
    studentId: sId,
    ...payload,
  });
}

/**
 * Broadcast when a new student registers via Google OAuth.
 */
function emitNewStudentRegistered(student) {
  if (!io) return;
  io.to('role:admin').emit('admin:new_student_application', {
    student,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a student updates their academic profile or uploads an ID card.
 */
function emitStudentProfileUpdated(student) {
  if (!io) return;
  const sId = String(student._id || student.id);
  io.to(`user:${sId}`).emit('user:profile_updated', { student });
  io.to('role:admin').emit('admin:student_profile_updated', { student });
}

/**
 * Broadcast when a new thesis or research paper is proposed / published.
 */
function emitThesisCreated(thesis) {
  if (!io) return;
  io.emit('thesis:created', thesis);
  io.to('role:admin').emit('admin:thesis_submitted', thesis);
}

/**
 * Broadcast when a publication is updated.
 */
function emitThesisUpdated(thesis) {
  if (!io) return;
  io.emit('thesis:updated', thesis);
}

/**
 * Broadcast when a publication is permanently removed.
 */
function emitThesisDeleted(thesisId) {
  if (!io) return;
  io.emit('thesis:deleted', { thesisId: String(thesisId) });
}

/**
 * Broadcast when a publication is pinned / unpinned by the editorial board.
 */
function emitThesisPinned(thesisId, isPinned) {
  if (!io) return;
  io.emit('thesis:pinned', { thesisId: String(thesisId), isPinned });
}

/**
 * Send an event directly to a specific user's live session room.
 */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

/**
 * Send an event to all connected administrators.
 */
function emitToAdmins(event, payload) {
  if (!io) return;
  io.to('role:admin').emit(event, payload);
}

module.exports = {
  initSocket,
  getIO,
  emitStudentStatusChanged,
  emitNewStudentRegistered,
  emitStudentProfileUpdated,
  emitThesisCreated,
  emitThesisUpdated,
  emitThesisDeleted,
  emitThesisPinned,
  emitToUser,
  emitToAdmins,
};
