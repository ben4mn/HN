// sw.js - Service Worker for HN Reader PWA
const CACHE_VERSION = 'hn-v1';
const PRECACHE_URLS = [
  '/HN/',
  '/HN/index.html',
  '/HN/static/css/style.css',
  '/HN/static/js/utils.js',
  '/HN/static/js/api.js',
  '/HN/static/js/thumbnails.js',
  '/HN/static/js/summaries.js',
  '/HN/static/js/settings.js',
  '/HN/static/js/stories.js',
  '/HN/static/js/comments.js',
  '/HN/static/js/reader.js',
  '/HN/static/js/app.js',
  '/HN/static/icon-192.png',
  '/HN/static/icon-512.png',
  '/HN/static/favicon.ico'
];

const CDN_URLS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Static assets: cache-first
  if (url.pathname.startsWith('/HN/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // HN API: network-first with cache fallback
  if (url.hostname === 'hacker-news.firebaseio.com') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN scripts: stale-while-revalidate
  if (CDN_URLS.some((cdn) => url.hostname.includes(cdn))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return res;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Third-party APIs (Jina, OpenAI, Microlink): network-only
  if (url.hostname.includes('r.jina.ai') ||
      url.hostname.includes('api.openai.com') ||
      url.hostname.includes('api.microlink.io')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
