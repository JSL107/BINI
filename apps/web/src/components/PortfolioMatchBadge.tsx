'use client';

import { useEffect, useState } from 'react';
import type { Job } from '@bini/types';
import {
  loadOwnedCategories,
  matchJobToOwned,
  CATEGORY_LABEL,
  PORTFOLIO_CHANGE_EVENT,
  type PortfolioCategory,
} from '../lib/portfolio';

/**
 * 잡 카드에 붙는 작은 매칭 칩. 사용자가 포트폴리오 카테고리를 한 번도 체크하지
 * 않았거나(빈 Set) 잡이 어떤 카테고리에도 매칭되지 않으면 아무것도 렌더하지 않는다.
 *
 * 매칭률 = 보유한 카테고리 / 잡이 요구하는 카테고리. tooltip(title)으로 부족한
 * 카테고리 라벨을 노출. localStorage가 SSR에선 비어있어 첫 paint는 빈 Set 기준이
 * 다 — useEffect로 hydration 후 실제 값 반영. 색은 50%/80% 분기.
 *
 * 다른 탭에서 변경이 일어나도 'storage' 이벤트로 동기화한다.
 */
export function PortfolioMatchBadge({
  job,
}: {
  job: Pick<Job, 'title' | 'tags' | 'gameTitle'>;
}) {
  const [owned, setOwned] = useState<Set<PortfolioCategory>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOwned(loadOwnedCategories());
    setReady(true);
    function reload() {
      setOwned(loadOwnedCategories());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === 'bini:portfolio:owned-v1') reload();
    }
    // 'storage'는 다른 탭, custom 이벤트는 같은 탭 (체크리스트 토글 즉시 반영).
    window.addEventListener('storage', onStorage);
    window.addEventListener(PORTFOLIO_CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PORTFOLIO_CHANGE_EVENT, reload);
    };
  }, []);

  if (!ready || owned.size === 0) return null;

  const m = matchJobToOwned(job, owned);
  if (m.required.length === 0) return null;

  const pct = Math.round(m.score * 100);
  const color =
    m.score >= 0.8
      ? 'bg-emerald-100 text-emerald-700'
      : m.score >= 0.5
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700';

  const title =
    m.missing.length === 0
      ? `포트폴리오 카테고리 ${m.required.length}개 모두 보유`
      : `부족 카테고리: ${m.missing.map((c) => CATEGORY_LABEL[c]).join(', ')}`;

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${color}`}
      title={title}
      aria-label={title}
    >
      포트폴리오 {pct}%
    </span>
  );
}
