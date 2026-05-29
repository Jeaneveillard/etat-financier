const CACHE_NAME = 'etat-financier-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/bundle.js'
];

// Installation du Service Worker : mise en cache initiale
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Mise en cache des fichiers hors ligne');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches si changement de version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Suppression de l\'ancien cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Interception des requêtes (Stratégie: Network First avec fallback sur le cache)
self.addEventListener('fetch', (event) => {
  // On ignore les requêtes non-GET et les requêtes hors de notre domaine (ex: API externes s'il y en avait)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si le réseau répond bien, on met à jour le cache silencieusement
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si erreur réseau (hors ligne), on cherche dans le cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback ultime : si on demande une page HTML, on renvoie index.html
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
