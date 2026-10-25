const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { initialPlan, validatePlan } = require('../services/researchPlan');

async function runResearchPlanTests() {
  const seed = initialPlan();
  assert.strictEqual(seed.tasks.length, 6);
  seed.tasks[0].done = true;
  assert.strictEqual(initialPlan().tasks[0].done, false, 'Defaults are not shared between members');
  assert.strictEqual(validatePlan({ ...seed, title: '  Research question  ' }).title, 'Research question');
  for (const invalid of [
    { targetDate: '2026-02-30' }, { targetDate: 'not-a-date' }, { title: 'x'.repeat(181) },
    { goal: 'x'.repeat(1201) }, { version: -1 }, { version: '0' }, { tasks: [{ id: '$set', title: 'Unsafe ID', done: false }] },
    { tasks: [{ id: 'same', title: 'One', done: false }, { id: 'same', title: 'Two', done: true }] },
    { tasks: [{ id: 'one', title: ' ', done: false }] }, { tasks: [{ id: 'one', title: 'One', done: 'false' }] },
    { tasks: Array.from({ length: 25 }, (_, i) => ({ id: String(i), title: 'Task', done: false })) },
  ]) assert.throws(() => validatePlan({ ...initialPlan(), ...invalid }), error => error.status === 400);
  assert.strictEqual(User.schema.path('researchPlan').options.select, false, 'Private roadmap is excluded from general account queries');

  const original = { find: User.findById, update: User.findOneAndUpdate, secret: process.env.JWT_SECRET };
  const owner = { _id: '200000000000000000000001', role: 'student', status: 'approved', researchPlan: initialPlan() };
  const other = { _id: '200000000000000000000002', role: 'student', status: 'approved', researchPlan: initialPlan() };
  User.findById = id => {
    const value = [owner, other].find(member => member._id === String(id));
    return Object.assign(Promise.resolve(value), { select: async () => value });
  };
  User.findOneAndUpdate = (filter, update) => ({ select: async field => {
    assert.strictEqual(field, 'researchPlan');
    const member = [owner, other].find(value => value._id === String(filter._id));
    if (!member || !filter.$or.some(condition => condition['researchPlan.version'] === member.researchPlan.version)) return null;
    assert.deepStrictEqual(Object.keys(update), ['$set']);
    member.researchPlan = update.$set.researchPlan; return member;
  } });
  process.env.JWT_SECRET = 'synthetic-research-plan-secret';
  const app = express(); app.use(express.json()); app.use('/api/user', require('../routes/user'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = async (method, body, member = owner) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/user/research-plan`, { method,
      headers: { 'Content-Type': 'application/json', ...(member ? { Authorization: 'Bearer ' + jwt.sign({ id: member._id }, process.env.JWT_SECRET) } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.strictEqual((await request('GET', null, null)).status, 401);
    assert.strictEqual((await request('GET')).body.plan.tasks.length, 6);
    const saved = await request('PUT', { ...initialPlan(), title: 'Private thesis plan', userId: other._id, $set: { role: 'admin' } });
    assert.strictEqual(saved.status, 200); assert.strictEqual(saved.body.plan.version, 1);
    assert.strictEqual(owner.role, 'student'); assert.strictEqual(other.researchPlan.title, '');
    assert.strictEqual((await request('GET', null, other)).body.plan.title, '');
    assert.strictEqual((await request('PUT', initialPlan())).status, 409, 'Stale tabs cannot overwrite a newer saved draft');
    assert.strictEqual(owner.researchPlan.title, 'Private thesis plan');
    assert.strictEqual((await request('PUT', { ...saved.body.plan, tasks: [] })).status, 200);
    owner.status = 'pending'; assert.strictEqual((await request('GET')).status, 403);
    owner.status = 'banned'; assert.strictEqual((await request('PUT', initialPlan())).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve)); User.findById = original.find; User.findOneAndUpdate = original.update;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  }
  console.log('Research roadmap: validation, private defaults, owner isolation, approved-account access and concurrent-edit conflicts passed.');
}
module.exports = { runResearchPlanTests };
if (require.main === module) runResearchPlanTests().catch(error => { console.error(error); process.exitCode = 1; });
