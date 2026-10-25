// Presence describes signed-in browser sessions, not anonymous visitors or page views.
// Keep it ephemeral: no browsing history, IP addresses, or device identifiers.
class PresenceTracker {
  constructor({ now = Date.now, ttl = 75000 } = {}) {
    this.sessions = new Map();
    this.now = now;
    this.ttl = ttl;
  }
  touch(socketId, user, active = false) {
    if (!user || user.status === 'banned') return this.remove(socketId);
    this.sessions.set(socketId, {
      userId: String(user.id), name: user.name || 'Member', role: user.role,
      active: active === true, seen: this.now(),
    });
  }
  remove(socketId) { this.sessions.delete(socketId); }
  snapshot() {
    const users = new Map();
    for (const [id, session] of this.sessions) {
      if (this.now() - session.seen > this.ttl) { this.sessions.delete(id); continue; }
      const previous = users.get(session.userId);
      users.set(session.userId, {
        userId: session.userId, name: session.name, role: session.role,
        state: session.active || previous?.state === 'active' ? 'active' : 'away',
        connections: (previous?.connections || 0) + 1,
      });
    }
    const members = [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { users: members, active: members.filter(u => u.state === 'active').length,
      away: members.filter(u => u.state === 'away').length, connected: members.length,
      updatedAt: new Date(this.now()).toISOString() };
  }
}
const presence = new PresenceTracker();
module.exports = { PresenceTracker, presence };
