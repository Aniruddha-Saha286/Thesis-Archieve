
const mongoose = require('mongoose');
let SearchSession;
try {
  SearchSession = require('../models/SearchSession');
} catch (e) {
  SearchSession = null;
}

const inMemorySessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_IN_MEMORY_SESSIONS = 250;

function cleanupExpiredInMemory() {
  const now = Date.now();
  for (const [key, session] of inMemorySessions.entries()) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      inMemorySessions.delete(key);
    }
  }
}

function getInMemorySession(sessionId) {
  if (!sessionId) return null;
  cleanupExpiredInMemory();
  return inMemorySessions.get(sessionId) || null;
}

function setInMemorySession(sessionId, session) {
  if (!sessionId || !session) return;
  if (inMemorySessions.size >= MAX_IN_MEMORY_SESSIONS) {
    cleanupExpiredInMemory();
    if (inMemorySessions.size >= MAX_IN_MEMORY_SESSIONS) {
      const oldestKey = inMemorySessions.keys().next().value;
      inMemorySessions.delete(oldestKey);
    }
  }
  inMemorySessions.set(sessionId, session);
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  cleanupExpiredInMemory();

  if (inMemorySessions.has(sessionId)) {
    const mem = inMemorySessions.get(sessionId);
    if (Date.now() - mem.lastAccessedAt <= SESSION_TTL_MS) {
      return mem;
    }
    inMemorySessions.delete(sessionId);
  }

  if (SearchSession && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const doc = await SearchSession.findOne({ sessionId }).lean();
      if (doc) {
        const session = {
          ...doc,
          id: doc.sessionId,
          lock: Promise.resolve(),
          recordsById: new Map((doc.buffer || []).map((r) => [String(r.id || r._id), r])),
          recordsByDoi: new Map((doc.buffer || []).filter((r) => r.doi).map((r) => [r.doi.toLowerCase().trim(), r])),
          recordsByTitleAuthor: new Map(),
        };
        inMemorySessions.set(sessionId, session);
        return session;
      }
    } catch (err) {
      console.warn('[SessionStore] getSession MongoDB read error:', err.message);
    }
  }

  return null;
}

async function saveSession(session) {
  const sid = session?.id || session?.sessionId;
  if (!sid) return;
  session.id = sid;
  session.sessionId = sid;
  session.lastAccessedAt = Date.now();

  setInMemorySession(sid, session);

  if (SearchSession && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      await SearchSession.findOneAndUpdate(
        { sessionId: session.id },
        {
          sessionId: session.id,
          scope: session.scope || null,
          sessionHash: session.sessionHash,
          query: session.query || '',
          filters: session.filters || {},
          sort: session.sort || 'relevance',
          buffer: session.buffer || [],
          providerStatus: session.providerStatus || {},
          providerStates: session.providerStates || {},
          frozenIndex: session.frozenIndex || 0,
          allProvidersExhausted: Boolean(session.allProvidersExhausted),
          lastAccessedAt: session.lastAccessedAt,
          createdAt: new Date(session.createdAt || Date.now()),
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.warn('[SessionStore] saveSession MongoDB write error:', err.message);
    }
  }
}

async function deleteSession(sessionId) {
  if (!sessionId) return;
  inMemorySessions.delete(sessionId);
  if (SearchSession && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      await SearchSession.deleteOne({ sessionId });
    } catch (err) {
      console.warn('[SessionStore] deleteSession error:', err.message);
    }
  }
}

module.exports = {
  getSession,
  saveSession,
  deleteSession,
  getInMemorySession,
  setInMemorySession,
  cleanupExpiredInMemory,
  inMemorySessions,
  SESSION_TTL_MS,
};
