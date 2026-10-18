const CACHE_PREFIX = 'flip7-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const ROOT = new URL('./', self.registration.scope);
const ASSETS = ['index.html', 'styles.css', 'app.js', 'engine.js', 'icon.svg', 'manifest.webmanifest'].map(file => new URL(file, ROOT).href);
const INDEX = ASSETS[0];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Navigation requests can include the app's hash route. Match the path so a
  // reload on #game or #score/p1 still falls back to the cached app shell.
  const navigation = request.mode === 'navigate' && url.origin === ROOT.origin && (url.pathname === ROOT.pathname || url.pathname === new URL(INDEX).pathname);
  if (request.method !== 'GET' || (!navigation && !ASSETS.includes(url.href))) return;
  const key = navigation ? INDEX : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok && response.type === 'basic') {
        try { await cache.put(key, response.clone()); } catch { /* Online use still works without storage. */ }
        return response;
      }
      return (await cache.match(key)) || response;
    } catch (error) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw error;
    }
  })());
});
