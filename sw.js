// ─── Road Trip Planner — Service Worker ───────────────────────────────────
const CACHE      = 'road-trip-v1';
const TILE_CACHE = 'road-trip-tiles-v1';
const MAX_TILES  = 500;

const PRECACHE = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/marked@11/marked.min.js',
];

// ── Install: pre-cache the app shell and CDN assets ───────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: remove outdated caches ─────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: route requests by origin / pattern ────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // GitHub API — always network-only (never cache PAT-authenticated requests)
  if (url.hostname === 'api.github.com') return;

  // OpenStreetMap tiles — tile-specific cache with rolling limit
  if (url.hostname.endsWith('.tile.openstreetmap.org')) {
    event.respondWith(handleTile(event.request));
    return;
  }

  // Everything else — cache-first, fall back to network and cache response
  event.respondWith(
    caches.match(event.request).then(hit => {
      if (hit) return hit;
      return fetch(event.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(cache => cache.put(event.request, res.clone()));
        }
        return res;
      });
    })
  );
});

// ── Tile handler: cache-first with 500-entry rolling limit ───────────────
async function handleTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit   = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const keys = await cache.keys();
      if (keys.length >= MAX_TILES) {
        await cache.delete(keys[0]);
      }
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}
