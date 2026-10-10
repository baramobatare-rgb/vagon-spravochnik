/* Service worker справочника. Лежит в корне, чтобы scope покрывал index.html.
   Сеть в приоритете, кэш — запасной вариант без подключения. */
const CACHE_NAME = 'vagon-spravochnik-v25';
const CORE_FILES = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/data.js',
  './assets/instr_data.js',
  './assets/vu45.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(CORE_FILES.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(resp => {
      if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'default')) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(req).then(cached => cached || (req.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('offline')))))
  );
});
