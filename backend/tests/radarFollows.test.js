const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const entitlementMiddleware = require('../middleware/entitlements');
async function testRadarFollows() {
  const routePath = require.resolve('../routes/user');
  const previousRoute = require.cache[routePath];
  const original = { find: User.findById, update: User.findOneAndUpdate, quota: entitlementMiddleware.enforceQuota, secret: process.env.JWT_SECRET };
  process.env.JWT_SECRET = 'synthetic-follow-test-secret';
  const user = { _id: '012345678901234567890123', role: 'student', status: 'approved', topicAlerts: [] };
  User.findById = () => Object.assign(Promise.resolve(user), { select: async () => user });
  // Deterministic persistence fixture checks the atomic query contract; real MongoDB remains a staging gate.
  User.findOneAndUpdate = (filter, update) => ({ select: async () => {
    assert.strictEqual(String(filter._id), user._id);
    assert.deepStrictEqual(filter.$expr, { $lt: [{ $size: { $ifNull: ['$topicAlerts', []] } }, 2] });
    const duplicate = filter.topicAlerts.$not.$elemMatch;
    const regex = new RegExp(duplicate.topic.$regex, duplicate.topic.$options);
    if (user.topicAlerts.length >= 2 || user.topicAlerts.some(a => regex.test(a.topic) && a.venueId === update.$push.topicAlerts.venueId)) return null;
    user.topicAlerts.push(update.$push.topicAlerts); return user;
  } });
  entitlementMiddleware.enforceQuota = () => (req, res, next) => {
    req.entitlements = { quotas: { maxTopicAlerts: 2 } };
    if (user.topicAlerts.length >= 2) return res.status(403).json({ code: 'FEATURE_LOCKED' });
    return next();
  };
  delete require.cache[routePath];
  const app = express(); app.use(express.json()); app.use('/api/user', require('../routes/user'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  const post = (body, authenticated = true) => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/user/alerts', method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + token } : {}) } }, response => {
      let data = ''; response.on('data', chunk => { data += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    }); request.on('error', reject); request.end(JSON.stringify(body));
  });
  try {
    assert.strictEqual((await post({ topic: 'crop' }, false)).status, 401);
    assert.strictEqual((await post({ topic: 'crop', venueId: 'invalid' })).status, 400);
    assert.strictEqual((await post({ topic: 'crop [AI]+', venueId: 'cvpr' })).status, 201);
    assert.strictEqual((await post({ topic: 'CROP [AI]+', venueId: 'cvpr' })).status, 409);
    const concurrent = await Promise.all([post({ topic: 'vision', venueId: 'iccv' }), post({ topic: 'vision', venueId: 'iccv' }), post({ topic: 'third' })]);
    assert.strictEqual(concurrent.filter(r => r.status === 201).length, 1); assert.strictEqual(user.topicAlerts.length, 2);
    assert.strictEqual((await post({ topic: 'crop [AI]+', venueId: 'cvpr' })).status, 409);
    assert.strictEqual((await post({ topic: 'over allowance' })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = original.find; User.findOneAndUpdate = original.update; entitlementMiddleware.enforceQuota = original.quota;
    delete require.cache[routePath]; if (previousRoute) require.cache[routePath] = previousRoute;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  }
}
module.exports = { testRadarFollows };
