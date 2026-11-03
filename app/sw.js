const V = "cockpit-v1";
const SHELL = ["./", "index.html", "app.js", "boot.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  // le réseau d'abord pour avoir la dernière version de l'appli, la copie si hors ligne
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((s) => s.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
