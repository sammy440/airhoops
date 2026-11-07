/*
 * AirHoops service worker: the game opens fast and plays solo offline.
 *
 *  • /mediapipe/* (pose models + WebAssembly, the big downloads): cache-first, kept across releases.
 *    Cached the first time they're used, so only the variant this device needs is stored. The loader
 *    asks for a model with HEAD first (poseLandmarker.ts), so HEAD is answered from the cache too.
 *  • /_next/static/* (content-hashed): cache-first, in a cache per release; older releases are dropped.
 *  • Icons, images, fonts, the manifest: stale-while-revalidate.
 *  • Pages: network first; offline, the page as last seen, else the game (/play), else a short note.
 *  • Everything else (the API on its own origin, RSC fetches, POSTs): not touched.
 *
 * Registered by components/app/ServiceWorker.tsx as /sw.js?v=<release>, so each deploy installs a new
 * worker that waits until every AirHoops tab is closed before taking over (no mid-game swaps).
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC = `airhoops-static-${VERSION}`;
const PAGES = `airhoops-pages-${VERSION}`;
const ASSETS = "airhoops-assets-v1"; // images, icons, fonts
const MEDIAPIPE = "airhoops-mediapipe-v1"; // kept across releases: copy-mediapipe.mjs pins the files to the package version
const KEEP = [STATIC, PAGES, ASSETS, MEDIAPIPE];

/** Pages to have ready offline from the start: the game is what the installed app opens. */
const PRECACHE_PAGES = ["/play"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE_PAGES))
      .catch(() => {}), // offline install: pages are cached as they're visited instead
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith("airhoops-") && !KEEP.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AirHoops · offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121212;color:#f8f8f5;font:16px system-ui,sans-serif;text-align:center;padding:16px}a{color:#e3a83c}</style>
<div><h1>You're offline</h1><p>This page hasn't been saved on this device yet.</p><p><a href="/play">Play solo</a> works offline once you've opened it.</p></div>`;

function cacheable(res) {
  return res && res.ok && res.status === 200 && res.type === "basic";
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: cacheName === MEDIAPIPE });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (cacheable(res)) return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return refresh;
}

/** HEAD for a model: answered from the cached GET, so the loader keeps using the local copy offline. */
async function head(request) {
  const hit = await caches.open(MEDIAPIPE).then((c) => c.match(request.url, { ignoreSearch: true }));
  if (hit) return new Response(null, { status: 200, headers: hit.headers });
  return fetch(request);
}

async function page(request) {
  const url = new URL(request.url);
  // One copy per page: /play?vs=… (a challenge link) is still /play
  const key = url.origin + url.pathname;
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (cacheable(res)) await cache.put(key, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(key)) ||
      (await cache.match(url.origin + "/play")) ||
      new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/mediapipe/")) {
    if (request.method === "HEAD") event.respondWith(head(request));
    else if (request.method === "GET" && !request.headers.has("range")) event.respondWith(cacheFirst(request, MEDIAPIPE));
    return;
  }
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  // Client-side navigations fetch RSC payloads: leave them to the network (offline, Next falls back to a full page load)
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (/^\/(icons|images)\//.test(url.pathname) || /\.(png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event, ASSETS));
  }
});
