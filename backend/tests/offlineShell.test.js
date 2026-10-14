const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
async function runOfflineShellTests() {
  const frontend = path.resolve(__dirname, '../../frontend');
  const listeners = {}; const added = []; const puts = [];
  const storedShell = { html: 'offline shell' };
  const cache = { addAll: async values => added.push(...values), match: async value => value === '/index.html' ? storedShell : undefined, put: async value => puts.push(value.url) };
  const self = { location: { origin: 'https://archive.example' }, addEventListener: (name, handler) => { listeners[name] = handler; } };
  const caches = { open: async () => cache, keys: async () => ['tta-shell-old', 'unrelated-app'], delete: async name => { assert.equal(name, 'tta-shell-old'); } };
  const template = fs.readFileSync(path.join(frontend, 'public/sw.js'), 'utf8').replace('__BUILD_VERSION__', 'test-version').replace('__CORE_ASSETS__', JSON.stringify(['/index.html', '/manifest.webmanifest']));
  vm.runInNewContext(template, { self, caches, URL, fetch: async request => { if (request.mode === 'navigate') throw new Error('offline'); return { ok: true, type: 'basic', clone() { return this; } }; } });
  let waiting; listeners.install({ waitUntil: value => { waiting = value; } }); await waiting;
  assert.deepEqual(added, ['/index.html', '/manifest.webmanifest']);
  listeners.activate({ waitUntil: value => { waiting = value; } }); await waiting;
  for (const url of ['https://archive.example/api/user/saved-papers', 'https://archive.example/socket.io/', 'https://external.example/paper.pdf']) {
    let intercepted = false; listeners.fetch({ request: { method: 'GET', url }, respondWith: () => { intercepted = true; } }); assert(!intercepted, `Must not cache ${url}`);
  }
  let response;
  listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://archive.example/?view=library' }, respondWith: value => { response = value; } });
  assert.equal(await response, storedShell);
  listeners.fetch({ request: { method: 'GET', url: 'https://archive.example/assets/index-test.js' }, respondWith: value => { response = value; } });
  await response; assert.deepEqual(puts, ['https://archive.example/assets/index-test.js']);
  const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/');
  manifest.icons.forEach(icon => { assert(fs.existsSync(path.join(frontend, 'public', icon.src))); });
  console.log('Offline app: navigation fallback, static asset caching, API/private-data exclusion and install manifest passed.');
}
module.exports = { runOfflineShellTests };
