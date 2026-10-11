/* Bump VERSION when app files change. Updates activate after old tabs close. */
const VERSION = 'v2';
const CACHE_PREFIX = 'grade1-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const ROOT = new URL('./', self.registration.scope);
const SHELL_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'data.js',
  'engine.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];
const SHELL_URLS = SHELL_FILES.map((file) => new URL(file, ROOT).href);
const SHELL_PATHS = new Set(SHELL_URLS.map((url) => new URL(url).pathname));
const INDEX_URL = new URL('index.html', ROOT).href;

self.addEventListener('install', (event) => {
  // addAll is atomic: an incomplete download leaves the previous app available.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })),
  )));
  // Do not skipWaiting: a new worker should not interrupt a card session.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Revalidate assets alongside HTML so new pages can receive updated code.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && response.type === 'basic') {
      // Keep a valid online response even if device storage is full.
      try { await cache.put(cacheKey, response.clone()); } catch { /* Continue online. */ }
      return response;
    }
    return (await cache.match(cacheKey)) || response;
  } catch (error) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, INDEX_URL));
  } else if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request, new URL(url.pathname, ROOT.origin).href));
  }
});
