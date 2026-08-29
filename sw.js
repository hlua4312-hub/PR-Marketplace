/**
 * PR MARKETPLACE - SERVICE WORKER
 *
 * Caches the app shell so the interface loads offline. Data requests are never
 * cached: a stale listing or a stale chat message is worse than none, so
 * anything going to Supabase always goes to the network.
 */

const VERSION = 'v3';
const SHELL_CACHE = `pr-shell-${VERSION}`;
const IMAGE_CACHE = `pr-images-${VERSION}`;
const MAX_CACHED_IMAGES = 60;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './pr_app_icon.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/apple-touch-icon.png',
  './js/vendor/supabase.js',
  './js/config.js',
  './js/supabase-client.js',
  './js/api.js',
  './js/ui.js',
  './js/store.js',
  './js/cropper.js',
  './js/feed.js',
  './js/detail.js',
  './js/sell.js',
  './js/messaging.js',
  './js/auth.js',
  './js/account.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll fails the whole install if any single file 404s, so add them
      // individually and let the rest through.
      .then(cache => Promise.all(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('Shell asset skipped:', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name !== SHELL_CACHE && name !== IMAGE_CACHE)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API, auth or realtime traffic.
  if (url.pathname.includes('/rest/v1/') ||
      url.pathname.includes('/auth/v1/') ||
      url.pathname.includes('/realtime/')) {
    return;
  }

  // Listing photos: serve from cache first, refresh in the background.
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // App shell and everything else: try the network, fall back to the cache.
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // A navigation with nothing cached still needs a page to land on.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone()).then(() => trimImageCache(cache));
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

/** Keep the photo cache from growing without bound on a phone. */
async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_IMAGES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_CACHED_IMAGES).map(key => cache.delete(key)));
}
