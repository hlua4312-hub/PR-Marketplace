/**
 * PR MARKETPLACE - MOBILE APP SERVICE WORKER
 * Enables offline caching, background sync, and native mobile standalone app installation.
 */

const CACHE_NAME = 'pr-marketplace-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './pr_app_icon.jpg',
  './js/api.js',
  './js/app.js',
  './js/supabase-client.js',
  './manifest.json'
];

// Install Event - Cache Static Application Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📱 PR Marketplace Service Worker: Caching mobile app shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('📱 PR Marketplace Service Worker: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First with Cache Fallback
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clone and store fresh copy in cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network is offline
        return caches.match(event.request);
      })
  );
});
