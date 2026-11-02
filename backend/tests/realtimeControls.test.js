const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { io: connect } = require('socket.io-client');
const User = require('../models/User');
const AuditEvent = require('../models/AuditEvent');
const Notification = require('../models/Notification');
const { PresenceTracker, presence } = require('../services/presenceService');
const { initSocket } = require('../socket');

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing socket event: ${name}`)), 3000);
    socket.once(name, value => { clearTimeout(timer); resolve(value); });
  });
}
async function runRealtimeControlsTests() {
  const { isAllowedOrigin } = require('../utils/allowedOrigins');
  assert(isAllowedOrigin('https://thesis-archieve.vercel.app', {}));
  assert(!isAllowedOrigin('https://untrusted-preview.vercel.app', {}));
  assert(isAllowedOrigin('https://review.example.org', { CLIENT_ORIGIN: 'https://review.example.org' }));
  let now = 100000;
  const tracker = new PresenceTracker({ now: () => now });
  const member = { id: 'member', name: 'Researcher', role: 'student', status: 'approved' };
  tracker.touch('tab1', member, true); tracker.touch('tab2', member, false);
  assert.strictEqual(tracker.snapshot().active, 1);
  assert.strictEqual(tracker.snapshot().users[0].connections, 2);
  tracker.remove('tab1'); assert.strictEqual(tracker.snapshot().away, 1);
  tracker.touch('tab2', { ...member, status: 'banned' }, true);
  assert.strictEqual(tracker.snapshot().connected, 0);
  tracker.touch('tab3', member, true); now += 75001;
  assert.strictEqual(tracker.snapshot().connected, 0, 'Dead sessions expire');

  const original = { findById: User.findById, findOne: User.findOne, audit: AuditEvent.create, secret: process.env.JWT_SECRET };
  const admin = { _id: '100000000000000000000001', role: 'admin', status: 'approved', permissions: [], name: 'Test Admin' };
  const student = { _id: '100000000000000000000002', role: 'student', status: 'pending', name: 'Test Student', isProfileComplete: true, save: async () => {} };
  const other = { _id: '100000000000000000000003', role: 'student', status: 'approved', name: 'Other Student' };
  const users = [admin, student, other];
  const audits = [];
  process.env.JWT_SECRET = 'realtime-controls-synthetic-secret';
  User.findById = id => ({ select: async () => users.find(user => user._id === String(id)) || null });
  User.findOne = async filter => users.find(user => user._id === String(filter._id) && user.role === filter.role);
  AuditEvent.create = async data => { audits.push(data); return data; };
  const app = express(); app.use(express.json());
  app.use('/api/admin', require('../routes/admin')); app.use('/api/auth', require('../routes/auth'));
  app.get('/protected', require('../middleware/auth').authenticateToken, (req, res) => res.json({ ok: true }));
  const server = http.createServer(app); const io = initSocket(server);
  const clients = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const request = async (path, { as = admin, body, method = 'GET' } = {}) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${token(as)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    };
    const open = async (user, options = {}) => {
      const socket = connect(base, { auth: { token: token(user) }, transports: ['websocket'], autoConnect: false, reconnection: false, ...options });
      clients.push(socket); const ready = event(socket, 'connect'); socket.connect(); await ready; return socket;
    };
    const studentSocket = await open(student, { extraHeaders: { Origin: 'https://thesis-archieve.vercel.app' } });
    const adminSocket = await open(admin);
    studentSocket.emit('presence:heartbeat', { active: true });
    const pulse = event(adminSocket, 'admin:presence'); adminSocket.emit('presence:subscribe');
    assert((await pulse).users.some(user => user.userId === student._id));
    assert.strictEqual((await request('/api/admin/presence', { as: null })).status, 401);
    assert.strictEqual((await request('/api/admin/presence', { as: student })).status, 403);
    assert.strictEqual((await request('/api/admin/presence')).status, 200);
    const healthyLookup = User.findById;
    try {
      User.findById = () => ({ select: async () => { throw new Error('Database temporarily unavailable'); } });
      assert.strictEqual((await request('/api/auth/me', { as: student })).status, 503, 'A database outage must not be reported as an invalid session');
      assert.strictEqual((await request('/protected', { as: student })).status, 503);
    } finally { User.findById = healthyLookup; }
    const statusEvent = event(studentSocket, 'user:status_changed');
    const suspended = await request(`/api/admin/student/${student._id}/ban`, { method: 'POST', body: { reason: 'Test suspension' } });
    assert.strictEqual(suspended.status, 200); assert.strictEqual((await statusEvent).status, 'banned');
    assert.strictEqual(student.statusBeforeBan, 'pending');
    assert.strictEqual((await request('/protected', { as: student })).status, 403);
    const account = await request('/api/auth/me', { as: student });
    assert.strictEqual(account.status, 200); assert.strictEqual(account.data.user.banReason, 'Test suspension');
    assert.strictEqual((await request(`/api/admin/verify-student/${student._id}`, { method: 'POST', body: { decision: 'approve' } })).status, 409);
    await request(`/api/admin/student/${student._id}/ban`, { method: 'POST', body: { reason: 'Repeated' } });
    assert.strictEqual(student.statusBeforeBan, 'pending');
    const bannedSocket = await open(student);
    const secondTab = await open(student);
    assert(io.sockets.adapter.rooms.has(`user:${student._id}`), 'Suspended members retain their own status channel');
    assert(!presence.snapshot().users.some(user => user.userId === student._id), 'Banned sessions are excluded from active members');
    const reinstated = event(bannedSocket, 'user:status_changed');
    const secondReinstated = event(secondTab, 'user:status_changed');
    const result = await request(`/api/admin/student/${student._id}/unban`, { method: 'POST' });
    assert.strictEqual(result.status, 200); assert.strictEqual(result.data.student.status, 'pending');
    assert.strictEqual((await reinstated).status, 'pending');
    assert.strictEqual((await secondReinstated).status, 'pending');
    assert.strictEqual((await request(`/api/admin/student/${student._id}/unban`, { method: 'POST' })).status, 409);
    assert.strictEqual((await request(`/api/admin/student/${student._id}/ban`, { method: 'POST', body: { reason: {} } })).status, 400);
    student.status = 'approved'; student.verifiedAt = new Date();
    await request(`/api/admin/student/${student._id}/ban`, { method: 'POST', body: { reason: 'Approved account test' } });
    assert.strictEqual((await request(`/api/admin/student/${student._id}/unban`, { method: 'POST' })).data.student.status, 'approved');
    assert(audits.some(a => a.action === 'STUDENT_REINSTATED'));
    const switched = event(adminSocket, 'auth:authenticated'); adminSocket.emit('auth:authenticate', token(other)); await switched;
    const serverSocket = io.sockets.sockets.get(adminSocket.id);
    assert(!serverSocket.rooms.has(`user:${admin._id}`)); assert(!serverSocket.rooms.has('role:admin'));
    assert(serverSocket.rooms.has(`user:${other._id}`));
    const disconnected = event(adminSocket, 'disconnect'); adminSocket.emit('auth:authenticate', 'invalid'); await disconnected;
    const denied = connect(base, { transports: ['websocket'], extraHeaders: { Origin: 'https://untrusted-preview.vercel.app' }, reconnection: false }); clients.push(denied);
    await event(denied, 'connect_error');
  } finally {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    User.findById = original.findById; User.findOne = original.findOne; AuditEvent.create = original.audit;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  }
  await testOnlineAlerts();
  console.log('Realtime controls: real socket delivery, ban/unban state, own-account status, permission isolation, CORS, presence expiry and online alert deduplication passed.');
}

async function testOnlineAlerts() {
  const { checkOnlinePapers } = require('../services/onlinePaperAlerts');
  const original = { find: Notification.find, update: Notification.findOneAndUpdate, offline: process.env.OFFLINE_MODE };
  const notifications = [];
  Notification.find = () => ({ select: () => ({ lean: async () => notifications }) });
  Notification.findOneAndUpdate = async (filter, update) => {
    const existing = notifications.find(n => n.dedupeKey === filter.dedupeKey);
    if (!existing) notifications.push(update.$setOnInsert);
    return { lastErrorObject: { updatedExisting: Boolean(existing) }, value: existing || update.$setOnInsert };
  };
  try {
    process.env.OFFLINE_MODE = 'false';
    const now = new Date('2026-10-23T12:00:00Z');
    const alert = { _id: 'follow', topic: 'crop disease', createdAt: new Date('2026-10-20'), publicationType: 'thesis' };
    const search = async params => {
      assert.strictEqual(params.filters.fromPublicationDate, '2026-10-20'); assert.strictEqual(params.filters.publicationType, 'thesis');
      return { records: [{ id: 'oa1', doi: '10.1234/crop', title: 'Crop disease detection thesis', publicationType: 'dissertation' }, { id: 'oa2', title: 'Unrelated accounting report' }, { id: 'oa3', title: 'Crop disease journal article', publicationType: 'journal-article' }], hasMore: true };
    };
    assert.strictEqual(await checkOnlinePapers({ _id: 'reader' }, alert, now, search), 1);
    assert.strictEqual(alert.onlineCheckStatus, 'limited'); assert.strictEqual(notifications.length, 1);
    assert.strictEqual(await checkOnlinePapers({ _id: 'reader' }, alert, new Date(now.getTime() + 16 * 60000), search), 0);
    assert.strictEqual(notifications.length, 1);
    const unavailable = { _id: 'failed', topic: 'different test query', createdAt: now };
    await checkOnlinePapers({ _id: 'reader' }, unavailable, now, async () => ({ error: 'timeout' }));
    assert.strictEqual(unavailable.onlineCheckStatus, 'unavailable'); assert(!unavailable.onlineCheckedAt);
    process.env.OFFLINE_MODE = 'true';
    assert.strictEqual(await checkOnlinePapers({ _id: 'reader' }, alert, now, () => { throw new Error('Must not fetch'); }), 0);
    assert.strictEqual(alert.onlineCheckStatus, 'disabled');
  } finally {
    Notification.find = original.find; Notification.findOneAndUpdate = original.update;
    if (original.offline === undefined) delete process.env.OFFLINE_MODE; else process.env.OFFLINE_MODE = original.offline;
  }
}
module.exports = { runRealtimeControlsTests };
if (require.main === module) runRealtimeControlsTests().catch(err => { console.error(err); process.exitCode = 1; });
