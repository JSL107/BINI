/**
 * BINI Service Worker — PWA installability satisfier 역할만.
 *
 * Chrome/Edge가 "Add to Home Screen" 프롬프트를 띄우려면 manifest + 등록된 SW가
 * 필요하다. 이 파일은 최소한의 요구를 만족시키기 위해 install/activate에서
 * skipWaiting + clients.claim만 호출한다. 별도 캐싱 전략은 의도적으로 두지
 * 않는다 — Vercel CDN이 이미 정적 자원을 캐싱하고, BINI는 데이터(/api/jobs)가
 * 매 cron 사이클마다 갱신되어 stale 캐시 위험이 크다.
 *
 * 후속 작업으로 push 알림이 필요해지면 여기에 'push' 이벤트 리스너를 추가한다.
 */

self.addEventListener('install', (event) => {
  // 즉시 활성화 — 기존 SW 대기 없이 새 버전이 바로 통제 가져감.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // 모든 열린 클라이언트(탭)을 즉시 이 SW 통제 하에 둠.
  event.waitUntil(self.clients.claim());
});

// fetch 이벤트 핸들러를 등록만 해두면 일부 브라우저(특히 Chrome)가 PWA로 더
// 적극 인지한다. 실제로는 그대로 통과(네트워크 우선).
self.addEventListener('fetch', () => {
  // no-op — 기본 네트워크 동작 유지.
});
