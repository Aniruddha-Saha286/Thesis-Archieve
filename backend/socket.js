const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./middleware/auth');
const User = require('./models/User');

let io = null;

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  ...(process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()) : []),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()) : []),
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Socket.IO CORS: Origin not allowed by security policy.'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Socket middleware: Verifies token AND loads current user from DB
  // Requires current role and status from database, preventing stale token escalation
  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (rawToken) {
        try {
          const secret = getJwtSecret();
          const decoded = jwt.verify(rawToken, secret);
          if (decoded && decoded.id) {
            const dbUser = await User.findById(decoded.id).select('role status name email');
            if (dbUser && dbUser.status !== 'banned') {
              socket.user = {
                id: String(dbUser._id),
                role: dbUser.role,
                status: dbUser.status,
              };
            } else {
              socket.user = null;
            }
          }
        } catch (tokenErr) {
          socket.user = null;
        }
      } else {
        socket.user = null;
      }
      return next();
    } catch (err) {
      return next();
    }
  });

  io.on('connection', (socket) => {
    // Join personal user room if authenticated
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // Join admin room strictly if verified administrator in database
    if (socket.user?.role === 'admin' && socket.user?.status === 'approved') {
      socket.join('role:admin');
    }

    // Client can dynamically re-authenticate after login
    socket.on('auth:authenticate', async (token) => {
      try {
        if (!token) return;
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        if (!decoded || !decoded.id) return;

        const dbUser = await User.findById(decoded.id).select('role status name email');
        if (!dbUser || dbUser.status === 'banned') {
          socket.user = null;
          socket.leave('role:admin');
          socket.emit('auth:error', { message: 'Account suspended or invalid.' });
          socket.disconnect(true);
          return;
        }

        socket.user = {
          id: String(dbUser._id),
          role: dbUser.role,
          status: dbUser.status,
        };

        socket.join(`user:${socket.user.id}`);
        if (dbUser.role === 'admin' && dbUser.status === 'approved') {
          socket.join('role:admin');
        } else {
          socket.leave('role:admin');
        }

        socket.emit('auth:authenticated', {
          userId: socket.user.id,
          role: socket.user.role,
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

/**
 * Remove privileged rooms and disconnect sockets when a user is banned, demoted, or logged out.
 */
function revokeUserSocketPrivileges(userId) {
  if (!io || !userId) return;
  const sId = String(userId);
  const room = io.sockets.adapter.rooms.get(`user:${sId}`);
  if (room) {
    for (const socketId of room) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.leave('role:admin');
        if (sock.user) {
          sock.user.role = 'student';
          sock.user.status = 'banned';
        }
        sock.emit('auth:revoked', { message: 'Privileges have been revoked or account status changed.' });
        sock.disconnect(true);
      }
    }
  }
}

// -------------------------------------------------------------
// Realtime Minimal Broadcast Event Helpers
// -------------------------------------------------------------

/**
 * Broadcast when an admin approves, rejects, bans, or reinstates a student.
 * Sends minimal sanitized payload only.
 */
function emitStudentStatusChanged(studentId, payload) {
  if (!io) return;
  const sId = String(studentId);
  const sanitized = {
    studentId: sId,
    status: payload.status,
    reason: payload.reason || '',
    verifiedAt: payload.verifiedAt || null,
  };
  io.to(`user:${sId}`).emit('user:status_changed', sanitized);
  io.to('role:admin').emit('admin:student_updated', sanitized);
}

/**
 * Broadcast when a new student registers via Google OAuth.
 * Delivered strictly to administrators; minimal registration notification only.
 */
function emitNewStudentRegistered(student) {
  if (!io) return;
  io.to('role:admin').emit('admin:new_student_application', {
    studentId: String(student._id || student.id),
    name: student.name,
    email: student.email,
    degreeProgram: student.degreeProgram,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a student updates their academic profile.
 * Sends sanitized profile data only.
 */
function emitStudentProfileUpdated(student) {
  if (!io) return;
  const sId = String(student._id || student.id);
  const sanitized = {
    id: sId,
    name: student.name,
    university: student.university,
    degreeProgram: student.degreeProgram,
    researchDomain: student.researchDomain,
  };
  io.to(`user:${sId}`).emit('user:profile_updated', { student: sanitized });
  io.to('role:admin').emit('admin:student_profile_updated', { studentId: sId });
}

/**
 * Broadcast when a new thesis or research paper is proposed.
 * SECURITY: If status is 'pending', emitted STRICTLY to administrators.
 * Only approved publications are broadcast to research users.
 */
function emitThesisCreated(thesis) {
  if (!io) return;
  const minimalAdminPayload = {
    id: String(thesis._id || thesis.id),
    title: thesis.title,
    publicationType: thesis.publicationType,
    author: thesis.author,
    status: thesis.status || 'pending',
    submittedAt: thesis.createdAt || new Date(),
  };

  // Always notify administrators of new submission
  io.to('role:admin').emit('admin:thesis_submitted', minimalAdminPayload);

  // Broadcast to research users ONLY after formal approval
  if (thesis.status === 'approved') {
    io.emit('thesis:created', {
      id: String(thesis._id || thesis.id),
      title: thesis.title,
      author: thesis.author,
      publishedYear: thesis.publishedYear,
      publicationType: thesis.publicationType,
      isOpenAccess: thesis.isOpenAccess,
      source: thesis.source || 'Local Repository',
    });
  }
}

/**
 * Broadcast when a publication is updated.
 */
function emitThesisUpdated(thesis) {
  if (!io) return;
  io.emit('thesis:updated', {
    id: String(thesis._id || thesis.id),
    title: thesis.title,
    isPinned: thesis.isPinned,
    upvotes: thesis.upvotes || 0,
  });
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
  io.emit('thesis:pinned', { thesisId: String(thesisId), isPinned: Boolean(isPinned) });
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
  revokeUserSocketPrivileges,
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
