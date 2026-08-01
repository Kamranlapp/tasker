// ── Tasker application shell cache ─────────────────────────────
const CACHE_NAME = 'tasker-shell-v2205';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './Icon.png?v=2203-icons1',
  './FavIcon.png?v=2203-icons1',
  './css/style.css?v=2205',
  './fonts/raleway-300.woff2',
  './fonts/raleway-600.woff2',
  './images/login-background.avif',
  './images/google-g.png',
  './images/notebook-types/calendar.png',
  './images/notebook-types/projects.png',
  './images/notebook-types/text.png',
  './js/vendor/supabase.js?v=2205',
  './js/vendor/supabase-global.js?v=2205',
  './js/db.js?v=2205',
  './js/state.js?v=2205',
  './js/offline.js?v=2205',
  './js/sync.js?v=2205',
  './js/tree.js?v=2205',
  './js/picker.js?v=2205',
  './js/settings.js?v=2205',
  './js/richtext.js?v=2205',
  './js/backup.js?v=2205',
  './js/render.js?v=2205',
  './js/hints.js?v=2205',
  './js/onboarding.js?v=2205',
  './js/app.js?v=2205'
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
