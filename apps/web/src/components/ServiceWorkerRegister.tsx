'use client';

import { useEffect } from 'react';

/**
 * 클라이언트 측에서 /sw.js를 1회 등록한다.
 *
 * 개발 환경에선 등록 안 함 — Next.js HMR과 SW 캐싱이 충돌하면 디버깅이 까다롭다.
 * 등록 실패는 조용히 삼킴(콘솔 warn만) — PWA install prompt가 안 떠도 사이트
 * 본래 흐름엔 영향 없다.
 *
 * 렌더링 0(DOM에 아무것도 안 그림). layout에서 한 번만 mount.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    // mount 직후가 아니라 'load' 이후로 미뤄 초기 페이지 렌더 비용에 영향 0.
    function register() {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('sw register 실패:', err);
        });
    }
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
