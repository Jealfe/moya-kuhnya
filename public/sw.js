const CACHE = 'moya-kuhnya-' + new URL('./', self.location.href).pathname + ':__BUILD__';
const PREFIX = new URL('./', self.location.href).pathname;
const FILES = __FILES__;
const SHELL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(file => new Request(new URL(file, self.location.href), {cache:'reload'})));
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'update') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('moya-kuhnya-' + PREFIX + ':') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') return (await cache.match(SHELL)) ?? fetch(request);
    return (await cache.match(request)) ?? fetch(request);
  })());
});
