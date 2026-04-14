/* ============================================================
   ULLIM — Service Worker
   전략: Cache-First (정적 자산) + Network-First (외부 폰트/CDN)
   ============================================================ */

const CACHE_NAME = 'ullim-v1';
const FONT_CACHE  = 'ullim-fonts-v1';

/* 앱 설치 시 즉시 캐싱할 핵심 파일 */
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
];

/* 외부 폰트 도메인 (별도 캐시로 관리) */
const FONT_ORIGINS = [
  'https://cdn.jsdelivr.net',
];

/* ── INSTALL ─────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())   // 새 SW를 즉시 활성화
  );
});

/* ── ACTIVATE ────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))   // 구버전 캐시 삭제
      )
    ).then(() => self.clients.claim())  // 열려 있는 탭을 즉시 제어
  );
});

/* ── FETCH ───────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) 폰트 / CDN → Cache-First (오래 캐싱)
  if (FONT_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(fontCacheFirst(request));
    return;
  }

  // 2) 같은 오리진의 GET 요청 → Cache-First with network fallback
  if (request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3) 나머지 (POST 등, chrome-extension 등) → 그냥 네트워크
  // (fetch 이벤트를 가로채지 않으면 기본 네트워크 동작)
});

/* Cache-First: 캐시 → 없으면 네트워크 → 캐시에 저장 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 오프라인이고 캐시도 없으면 index.html로 폴백
    return caches.match('./index.html');
  }
}

/* 폰트 전용: Cache-First, 캐시 수명 무기한 */
async function fontCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(FONT_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

/* ── MESSAGE: 수동 캐시 갱신 트리거 ─────── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
