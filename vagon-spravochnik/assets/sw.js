/* Старый worker из /assets/ больше не используется: его scope не покрывал страницу,
   а относительные URL кэшировали несуществующие assets/assets/*. При обновлении он снимает себя. */
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url))))
  );
});
