/* 학사부기 서비스워커 — push 알림 + 공개 데이터 오프라인 캐시.
   개인 경로(/api/account, /api/community, /api/push, /api/advisor, /api/analytics)는
   캐시하지 않고 항상 네트워크를 탄다. */
'use strict';

const CACHE = 'hs-static-v1';
const DATA_CACHE = 'hs-data-v1';
const DATA_API = /^\/api\/(courses|schedule|activities|dept-rules|dept-pages)(\/|$|\?)/;
const STATIC_ASSET = /^\/(icons\/|illustrations\/|_next\/|favicon\.svg|logo-mark\.svg|manifest\.webmanifest|apple-touch-icon\.png)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 공개 스냅샷 API: stale-while-revalidate — 캐시를 즉시 주고 백그라운드 갱신
  if (DATA_API.test(url.pathname)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // 해시 정적 자산: 캐시 우선
  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 페이지 탐색: 네트워크 우선, 오프라인이면 캐시된 앱 셸로 폴백
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '학사부기', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin)) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
