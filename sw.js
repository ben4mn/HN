// sw.js - HN Reader service worker
// Shell is precached and versioned; API responses are cached at runtime for offline reading.

const VERSION = '2.0.1';
const SHELL = `hn-shell-${VERSION}`;
const RUNTIME = 'hn-runtime';
const RUNTIME_MAX = 400;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './static/css/app.css',
  './static/js/utils.js',
  './static/js/store.js',
  './static/js/extractive.js',
  './static/js/api.js',
  './static/js/feed.js',
  './static/js/reader.js',
  './static/js/thread.js',
  './static/js/gestures.js',
  './static/js/app.js',
  './static/vendor/marked.min.js',
  './static/fonts/Figtree-normal.woff2',
  './static/fonts/Figtree-italic.woff2',
  './static/icons/icon.svg',
  './static/icons/icon-192.png',
  './static/icons/icon-512.png',
  './static/icons/favicon.ico'
];

const scopeUrl = () => new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // cache: 'reload' bypasses the HTTP cache so a new shell version never installs stale files.
      cache.addAll(SHELL_FILES.map((f) => new Request(new URL(f, scopeUrl()).href, { cache: 'reload' })))
    )
  );
  // No skipWaiting here: the page shows an "update ready" toast and asks first.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('hn-shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ---- helpers ----

async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_MAX) return;
  const drop = keys.slice(0, keys.length - RUNTIME_MAX);
  await Promise.all(drop.map((k) => cache.delete(k)));
}

async function putRuntime(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(RUNTIME);
  await cache.put(request, response.clone());
  trimRuntime();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(request, { timeout = 8000 } = {}) {
  try {
    const res = await withTimeout(fetch(request), timeout);
    if (res.ok) putRuntime(request, res);
    return res;
  } catch (err) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  const fetching = fetch(request).then((res) => { putRuntime(request, res); return res; }).catch(() => null);
  return cached || (await fetching) || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(SHELL);
    cache.put(request, res.clone());
  }
  return res;
}

async function shellFallback() {
  const scope = scopeUrl();
  return (await caches.match(new URL('./index.html', scope).href)) || (await caches.match(scope.href));
}

// ---- fetch ----

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = scopeUrl();
  const sameOrigin = url.origin === scope.origin;
  const inScope = sameOrigin && url.pathname.startsWith(scope.pathname);

  // App navigations: network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(request), 4000)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(new URL('./index.html', scope).href, res.clone()));
          return res;
        })
        .catch(async () => (await shellFallback()) || Response.error())
    );
    return;
  }

  // Our API
  if (inScope && url.pathname.includes('/api/')) {
    if (url.pathname.endsWith('/api/meta')) {
      event.respondWith(staleWhileRevalidate(request));
    } else if (url.pathname.endsWith('/api/health')) {
      event.respondWith(fetch(request));
    } else {
      event.respondWith(networkFirst(request, { timeout: 12000 }));
    }
    return;
  }

  // Static shell assets (fonts, css, js, icons): cache first.
  if (inScope) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Direct-mode data sources (when no backend): network first with cache fallback.
  if (url.hostname === 'hacker-news.firebaseio.com' || url.hostname === 'hn.algolia.com') {
    event.respondWith(networkFirst(request, { timeout: 10000 }));
    return;
  }

  // Everything else (images, Jina, favicons): straight to network.
});
