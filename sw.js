// ── Tasker application shell cache ─────────────────────────────
const CACHE_NAME = 'tasker-shell-v2103';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './Icon.png',
  './css/style.css?v=2103',
  './GoogleG.svg?v=2103',
  './js/vendor/supabase.js?v=2103',
  './js/vendor/supabase-global.js?v=2103',
  './js/db.js?v=2103',
  './js/state.js?v=2103',
  './js/offline.js?v=2103',
  './js/sync.js?v=2103',
  './js/tree.js?v=2103',
  './js/picker.js?v=2103',
  './js/settings.js?v=2103',
  './js/backup.js?v=2103',
  './js/render.js?v=2103',
  './js/hints.js?v=2103',
  './js/onboarding.js?v=2103',
  './js/app.js?v=2103'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('tasker-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            return caches.open(CACHE_NAME)
              .then(cache => cache.put('./index.html', copy))
              .then(() => response);
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(request, copy))
          .then(() => response);
      }
      return response;
    }))
  );
});
