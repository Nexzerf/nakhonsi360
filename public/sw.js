/*
 * Nakhonsi360 service worker.
 *
 * - The app shell and built assets are cached so the app opens fast and
 *   the emergency numbers page (/emergency) works with no connection.
 * - Live data (/api/*) is never answered from the cache: an old water level
 *   shown as current could mislead someone in a flood. Offline, the app
 *   shows that it is offline instead.
 * - Writes (reports, updates, photos) always go to the network.
 */
const VERSION = 'n360-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ['/', '/emergency', '/emergency?lang=en', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // map tiles, fonts from others: browser default
  if (url.pathname.startsWith('/api/')) return; // live data: network only

  // Built files are content-hashed: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.woff2')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(ASSETS).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network first (fresh content), cached copy when offline, emergency numbers as the last resort.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('/emergency')) || Response.error()),
    );
  }
});
