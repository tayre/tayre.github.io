const CACHE = 'still-shell-7cc69c06dd26';
const FILES = ['./', './index.html', './style.css', './still.js', './icon.svg', './manifest.webmanifest'];
const root = new URL('./', self.location).href;
const allowed = new Set(FILES.map(file => new URL(file, root).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('still-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'VERIFY_OFFLINE') event.waitUntil(caches.open(CACHE).then(async cache => {
    const checks = await Promise.all(FILES.map(file => cache.match(new URL(file, root).href)));
    if (checks.every(Boolean)) event.source?.postMessage({ type: 'OFFLINE_READY' });
  }));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache API requests, unrelated sibling sites, or external services.
  if (event.request.mode === 'navigate' && (url.pathname === new URL(root).pathname || url.pathname === new URL('index.html', root).pathname)) {
    event.respondWith(caches.match(new URL('index.html', root).href).then(cached => cached || fetch(event.request)));
  } else if (allowed.has(url.href)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
