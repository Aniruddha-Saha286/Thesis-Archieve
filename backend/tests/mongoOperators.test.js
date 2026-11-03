const assert = require('assert');
const express = require('express');
const rejectMongoOperators = require('../middleware/rejectMongoOperators');

async function runMongoOperatorTests() {
  const app = express();
  app.set('query parser', 'extended');
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(rejectMongoOperators);
  app.all('/test', (req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/test`;
  try {
    for (const [path, options, expected] of [
      ['', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ email: { $ne: null } }] }) }, 400],
      ['', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email%5B%24ne%5D=x' }, 400],
      ['?email%5B%24ne%5D=x', {}, 400],
      ['', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Cost $5', items: [{ name: 'example' }] }) }, 204],
    ]) {
      const response = await fetch(url + path, options);
      assert.strictEqual(response.status, expected);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
module.exports = { runMongoOperatorTests };
