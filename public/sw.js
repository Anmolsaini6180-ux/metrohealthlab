// Minimal service worker — its main job here is to satisfy Chrome's
// installability requirement so the "Install app" prompt appears, plus
// give the app shell a fast/offline-tolerant start.
//
// Deliberately NOT caching Firestore/API responses: this app is
// realtime by design (admin edits must appear on the customer site
// immediately), and a stale cached price or booking status would be
// actively wrong. Only static build assets are cached.

const CACHE = "metro-health-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept Firebase/Google traffic — auth, Firestore streams
  // and Cloud Functions must always hit the network so realtime data
  // and sign-in work correctly.
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("gstatic")
  ) {
    return;
  }

  // Navigations: network first (so a freshly deployed build is picked
  // up immediately), falling back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((r) => r || Response.error()))
    );
    return;
  }

  // Same-origin static assets: serve from cache, refresh in background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
