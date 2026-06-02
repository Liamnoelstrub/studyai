const CACHE = 'studyai-v1';
const FILES = ['/studyai/', '/studyai/index.html', '/studyai/style.css', '/studyai/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
