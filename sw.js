// Offline support: cache the app shell, serve network-first so updates land
// immediately when online and the cached copy is used when offline.

const CACHE = 'indexcards-v2';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'js/account.js',
  'js/app.js',
  'js/cloud.js',
  'js/cloud-config.js',
  'js/config.js',
  'js/io.js',
  'js/speech.js',
  'js/srs.js',
  'js/store.js',
  'js/sync.js',
  'js/util.js',
  'js/modes/common.js',
  'js/modes/flashcards.js',
  'js/modes/learn.js',
  'js/modes/match.js',
  'js/modes/review.js',
  'js/modes/test.js',
  'js/modes/write.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
