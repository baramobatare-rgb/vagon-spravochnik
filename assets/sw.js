/* Service worker: офлайн-доступ к справочнику справочника осмотрщика вагонов.
   Стратегия: cache-first для файлов сайта, чтобы после первого визита
   справочник и PDF открывались даже без подключения к сети. */
const CACHE_NAME = 'vagon-spravochnik-v11';
const CORE_FILES = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/data.js',
  'assets/instr_data.js',
  'assets/vu45.js',
  'assets/manifest.webmanifest',
  'assets/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(CORE_FILES.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
