/* Public assets only. Never cache authenticated pages, API data or mutations. */
const CACHE = "movendi-public-v1";
const PUBLIC = ["/offline.html", "/pwa/icon-192.png", "/pwa/icon-512.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC))));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("movendi-public-") && key !== CACHE).map((key) => caches.delete(key)))), self.clients.claim()])));
self.addEventListener("message", (event) => { if (event.data === "ACTIVATE_UPDATE") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PUBLIC.includes(url.pathname)) event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  else if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});
