/* Service worker: офлайн-доступ к справочнику РД 32 ЦВ 169-2017.
   Стратегия: cache-first для файлов сайта, чтобы после первого визита
   справочник и PDF открывались даже без подключения к сети. */
const CACHE_NAME = 'rd-32-cv-169-2017-v7';
const CORE_FILES = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/data.js',
  'assets/instr_data.js',
  'assets/manifest.webmanifest',
  'assets/icon.svg',
  'assets/figures/page-10.jpg',
  'assets/figures/page-11.jpg',
  'assets/figures/page-12.jpg',
  'assets/figures/page-13.jpg',
  'assets/figures/page-14.jpg',
  'assets/figures/page-22.jpg',
  'assets/figures/page-23.jpg',
  'assets/figures/page-25.jpg',
  'assets/figures/page-27.jpg',
  'assets/figures/page-28.jpg',
  'assets/figures/page-31.jpg',
  'assets/figures/page-33.jpg',
  'assets/figures/page-35.jpg',
  'assets/figures/page-36.jpg',
  'assets/figures/page-37.jpg',
  'assets/figures/page-38.jpg',
  'assets/figures/page-39.jpg',
  'assets/figures/page-40.jpg',
  'assets/figures/page-41.jpg',
  'assets/figures/page-42.jpg',
  'assets/figures/page-43.jpg',
  'assets/figures/page-44.jpg',
  'assets/figures/page-52.jpg',
  'assets/figures/page-53.jpg',
  'assets/figures/page-56.jpg',
  'assets/figures/page-68.jpg',
  'assets/figures/page-69.jpg',
  'assets/figures/page-70.jpg',
  'assets/figures/page-71.jpg',
  'assets/figures/page-9.jpg'
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
