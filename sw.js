/**
 * CAMPUS CART - SERVICE WORKER
 *
 * Caches the app shell so the interface loads offline. Data requests are never
 * cached: a stale listing or a stale chat message is worse than none, so
 * anything going to Supabase always goes to the network.
 */

const VERSION = 'v12';
const SHELL_CACHE = `campuscart-shell-${VERSION}`;
const IMAGE_CACHE = `campuscart-images-${VERSION}`;
const MAX_CACHED_IMAGES = 60;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/logo-256.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/apple-touch-icon.png',
  './js/vendor/supabase.js',
  './js/config.js',
  './js/campus.js',
  './js/supabase-client.js',
  './js/api.js',
  './js/ui.js',
  './js/store.js',
  './js/cropper.js',
  './js/feed.js',
  './js/detail.js',
  './js/sell.js',
  './js/requests.js',
  './js/messaging.js',
  './js/auth.js',
  './js/account.js',
  './js/app.js',
  './js/updates.js',
  './js/upi.js',
  './js/payments.js',
  './js/gestures.js',
  './js/vendor/qrcode.js'
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
      // Deliberately NOT skipWaiting here. Taking over instantly would swap
      // the assets under a tab that is already running the previous version,
      // leaving old modules talking to a new shell. The page asks the user
      // first, then sends SKIP_WAITING when they accept.
  );
});

// The page sends this once the user has agreed to update.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // The HTML document itself is fetched with the HTTP cache bypassed. Without
  // that, a plain static server sends no Cache-Control, the browser applies
  // heuristic caching, and an edited page keeps rendering the old markup - the
  // change is on disk and served correctly, but never reaches the screen.
  if (request.mode === 'navigate') {
    event.respondWith(freshDocument(request));
    return;
  }

  // App shell and everything else: try the network, fall back to the cache.
  event.respondWith(networkFirst(request));
});

async function freshDocument(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return (await cache.match(request)) ||
           (await cache.match('./index.html')) ||
           Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // 'no-cache' revalidates with the server rather than trusting the browser's
    // heuristic cache. A static file server that sends no Cache-Control leaves
    // the browser guessing, and it guesses that an edited stylesheet is still
    // fresh - so a change reaches the disk and the server but never the screen.
    // This costs a conditional request and usually gets a cheap 304 back.
    const response = await fetch(request, { cache: 'no-cache' });
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
