// Local Wildlife service worker — offline support.
// App shell is precached; data + images are cached on first use (cache-first).
const VERSION = "v3";
const SHELL_CACHE = `lw-shell-${VERSION}`;
const RUNTIME_CACHE = `lw-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "./",
  "index.html",
  "credits.html",
  "css/styles.css",
  "js/app.js",
  "js/data.js",
  "js/pwa.js",
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "assets/icons/placeholder.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // only handle same-origin

  const isData = url.pathname.includes("/data/");
  const isImage = url.pathname.includes("/assets/images/");

  if (isData || isImage) {
    // cache-first for data + images (fill offline cache lazily)
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // network-first with cache fallback for the shell
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("index.html")))
  );
});
