// Bei jedem Deploy mit geänderten Dateien die Version erhöhen (v2 -> v3 ...),
// damit der neue Service Worker frische Dateien lädt und alte Caches löscht.
const CACHE = 'studyai-v4';
const FILES = ['/studyai/', '/studyai/index.html', '/studyai/style.css', '/studyai/app.js'];

// Installieren: frische Dateien cachen und sofort übernehmen
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

// Aktivieren: alle alten Caches entfernen und Kontrolle sofort übernehmen
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first für die eigenen App-Dateien (immer aktuell), Cache als Offline-Fallback
self.addEventListener('fetch', e => {
  const req = e.request;
  const isAppFile = FILES.some(f => req.url.endsWith(f)) || req.mode === 'navigate';

  if (isAppFile) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/studyai/index.html')))
    );
  } else {
    // Übrige Requests (CDN-Skripte etc.): Cache-first
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
