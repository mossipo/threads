// Threads service worker: the app shell is stored at install; data files are stored as they are
// used (or all at once from Home). Bump SHELL when app files change and DATA when data is rebuilt.
const SHELL = 'threads-shell-v1';
const DATA = 'threads-data-v1';
const SHELL_FILES = [
  './', 'index.html', 'selftest.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'app/styles.css', 'app/main.js', 'app/views.js', 'app/data.js', 'app/refs.js', 'app/ui.js', 'app/trail.js',
  'app/links.js', 'app/graph.js', 'app/claim.js', 'app/selftest.js',
  'data/idx/verses.json', 'data/meta/sources.json', 'data/meta/files.json', 'data/meta/checks.json', 'data/ai/ai.json', 'data/journeys/journeys.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('threads-') && k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) (await caches.open(DATA)).put(e.request, res.clone());
      return res;
    })());
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
