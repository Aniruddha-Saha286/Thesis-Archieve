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
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vercel.app')) return true;
  } catch {
  }
  return false;
}

function assignSocketRooms(socket, user) {
  if (!socket || !user) return;
  socket.join(`user:${user.id}`);

  socket.leave('role:admin');
  socket.leave('role:editor');
  socket.leave('perm:students.view');
  socket.leave('perm:students.verify');
  socket.leave('perm:students.suspend');
  socket.leave('perm:documents.view');
  socket.leave('perm:payments.view');
  socket.leave('perm:payments.review');
  socket.leave('perm:publications.moderate');
  socket.leave('perm:reports.moderate');

  if (user.role === 'admin' && user.status === 'approved') {
    socket.join('role:admin');
    socket.join('perm:students.view');
    socket.join('perm:students.verify');
    socket.join('perm:students.suspend');
    socket.join('perm:documents.view');
    socket.join('perm:payments.view');
    socket.join('perm:payments.review');
    socket.join('perm:publications.moderate');
    socket.join('perm:reports.moderate');
  } else if (user.role === 'editor' && user.status === 'approved') {
    socket.join('role:editor');
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    for (const p of perms) {
      socket.join(`perm:${p}`);
    }
  }
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
            const dbUser = await User.findById(decoded.id).select('role status permissions name email');
            if (dbUser && dbUser.status !== 'banned') {
              socket.user = {
                id: String(dbUser._id),
                role: dbUser.role,
                status: dbUser.status,
                permissions: dbUser.permissions || [],
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
    if (socket.user) {
      assignSocketRooms(socket, socket.user);
    }

    socket.on('auth:authenticate', async (token) => {
      try {
        if (!token) return;
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        if (!decoded || !decoded.id) return;

        const dbUser = await User.findById(decoded.id).select('role status permissions name email');
        if (!dbUser || dbUser.status === 'banned') {
          socket.user = null;
          revokeUserSocketPrivileges(decoded.id);
          socket.emit('auth:error', { message: 'Account suspended or invalid.' });
          socket.disconnect(true);
          return;
        }

        socket.user = {
          id: String(dbUser._id),
          role: dbUser.role,
          status: dbUser.status,
          permissions: dbUser.permissions || [],
        };

        assignSocketRooms(socket, socket.user);

        socket.emit('auth:authenticated', {
          userId: socket.user.id,
          role: socket.user.role,
          permissions: socket.user.permissions,
        });
      } catch (err) {
        socket.emit('auth:error', { message: 'Invalid socket authentication token.' });
      }
    });

    socket.on('disconnect', () => {
    });
  });

  return io;
}

function getIO() {
  return io;
}

function revokeUserSocketPrivileges(userId) {
  if (!io || !userId) return;
  const sId = String(userId);
  const room = io.sockets.adapter.rooms.get(`user:${sId}`);
  if (room) {
    for (const socketId of room) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.leave('role:admin');
        sock.leave('role:editor');
        sock.leave('perm:students.view');
        sock.leave('perm:students.verify');
        sock.leave('perm:students.suspend');
        sock.leave('perm:documents.view');
        sock.leave('perm:payments.view');
        sock.leave('perm:payments.review');
        sock.leave('perm:publications.moderate');
        sock.leave('perm:reports.moderate');
        if (sock.user) {
          sock.user.role = 'student';
          sock.user.permissions = [];
        }
        sock.emit('auth:revoked', { message: 'Privileges have been modified or account status changed.' });
        sock.disconnect(true);
      }
    }
  }
}

function syncUserSocketRooms(userId, user) {
  if (!io || !userId) return;
  const sId = String(userId);
  const room = io.sockets.adapter.rooms.get(`user:${sId}`);
  if (room) {
    for (const socketId of room) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        if (sock.user) {
          sock.user.role = user.role;
          sock.user.status = user.status;
          sock.user.permissions = Array.isArray(user.permissions) ? user.permissions : [];
        }
        assignSocketRooms(sock, {
          id: sId,
          role: user.role,
          status: user.status,
          permissions: Array.isArray(user.permissions) ? user.permissions : [],
        });
      }
    }
  }
}


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
  io.to('role:admin').to('perm:students.view').emit('admin:student_updated', sanitized);
}

function emitNewStudentRegistered(student) {
  if (!io) return;
  io.to('role:admin').to('perm:students.view').emit('admin:new_student_application', {
    studentId: String(student._id || student.id),
    name: student.name,
    email: student.email,
    degreeProgram: student.degreeProgram,
    timestamp: new Date().toISOString(),
  });
}

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
  io.to('role:admin').to('perm:students.view').emit('admin:student_profile_updated', { studentId: sId });
}

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

  io.to('role:admin').to('perm:publications.moderate').emit('admin:thesis_submitted', minimalAdminPayload);

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

function emitThesisUpdated(thesis) {
  if (!io) return;
  io.emit('thesis:updated', {
    id: String(thesis._id || thesis.id),
    title: thesis.title,
    isPinned: thesis.isPinned,
    upvotes: thesis.upvotes || 0,
  });
}

function emitThesisDeleted(thesisId) {
  if (!io) return;
  io.emit('thesis:deleted', { thesisId: String(thesisId) });
}

function emitThesisPinned(thesisId, isPinned) {
  if (!io) return;
  io.emit('thesis:pinned', { thesisId: String(thesisId), isPinned: Boolean(isPinned) });
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

function emitToAdmins(event, payload) {
  if (!io) return;
  io.to('role:admin').emit(event, payload);

  if (event.includes('payment')) {
    io.to('perm:payments.view').emit(event, payload);
  } else if (event.includes('student')) {
    io.to('perm:students.view').emit(event, payload);
  } else if (event.includes('thesis')) {
    io.to('perm:publications.moderate').emit(event, payload);
  } else if (event.includes('report')) {
    io.to('perm:reports.moderate').emit(event, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  revokeUserSocketPrivileges,
  syncUserSocketRooms,
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
