/* 离线缓存。改了前端代码就把 VERSION 加一，用户下次打开自动换新。 */
const VERSION = 'zs-gm-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/chat.css',
  './assets/mobile.css',
  './assets/ui.css',
  './assets/luxe.css',
  './assets/data.js',
  './assets/latex.js',
  './assets/scan.js',
  './assets/app.js',
  './assets/icon-120.png',
  './assets/icon-152.png',
  './assets/icon-167.png',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-1024.png',
  './data/rules.js',
  './data/writing.js',
  './data/beauty.js',
  './data/lexicon.js',
  './data/sequences.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管本站资源，API 请求原样放行
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
