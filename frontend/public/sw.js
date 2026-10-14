const VERSION = '__BUILD_VERSION__';
const CORE = __CORE_ASSETS__;
const CACHE = 'tta-shell-' + VERSION;
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE))); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tta-shell-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  // Never cache authenticated APIs, account data, external PDFs, or non-GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html')))); return;
  }
  if (!url.pathname.startsWith('/assets/') && !['/app-icon.svg', '/app-icon-192.png', '/app-icon-512.png', '/manifest.webmanifest'].includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const existing = await cache.match(request); if (existing) return existing;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  }));
});
