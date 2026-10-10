/* Bump VERSION whenever the app shell changes. Updates activate once old tabs close. */
const VERSION = 'v3';
const CACHE_PREFIX = 'grade4-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const ROOT = new URL('./', self.registration.scope);
const SHELL_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'engine.js',
  'pacing.js',
  'facts-data.js',
  'facts-engine.js',
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
  // addAll is atomic: an incomplete download never replaces a working app shell.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })),
  )));
  // Deliberately no skipWaiting: don't swap code during a child's practice round.
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
    // Revalidate static files too, so a new HTML page never receives cache-first old JS.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && response.type === 'basic') {
      // A storage quota error must not hide a valid online response.
      try { await cache.put(cacheKey, response.clone()); } catch { /* Keep working online. */ }
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
    // Canonical cache keys allow ordinary query strings without duplicate shell copies.
    event.respondWith(networkFirst(request, new URL(url.pathname, ROOT.origin).href));
  }
});
