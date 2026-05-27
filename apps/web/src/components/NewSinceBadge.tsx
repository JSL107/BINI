'use client';

import { useEffect, useState } from 'react';
import { fetchNewSinceCount } from '../lib/api';
import {
  VISIT_BASELINE_CHANGE_EVENT,
  loadVisitBaseline,
  setVisitBaseline,
} from '../lib/visit-baseline';

/**
 * 홈 헤더의 "지난 방문 이후 신규 N건" 뱃지.
 *
 * 동작:
 * - 첫 방문 → baseline 없음 → 지금 시각으로 set, 뱃지 안 보임
 * - 다음 방문 → baseline 이후 firstSeenAt된 잡 수 fetch → 뱃지 노출
 * - 사용자가 "본 걸로 표시" 클릭 → baseline = now → 뱃지 즉시 사라짐
 *
 * SSR-safe: useState(false) → useEffect로 hydration 후 처리. count=0이면 미노출.
 */
export function NewSinceBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const baseline = loadVisitBaseline();
      if (!baseline) {
        // 첫 방문 — baseline을 지금으로 세팅하고 뱃지는 숨김.
        // 다음 방문부터 신규 카운트가 의미를 가진다.
        setVisitBaseline(new Date().toISOString());
        if (!cancelled) {
          setCount(0);
          setSince(null);
        }
        return;
      }
      try {
        const res = await fetchNewSinceCount(baseline);
        if (!cancelled) {
          setCount(res.count);
          setSince(res.since);
        }
      } catch {
        // 네트워크/서버 에러 — 뱃지 숨김(0으로). 페이지 본 흐름에 영향 없도록.
        if (!cancelled) setCount(0);
      }
    }
    refresh();
    function onBaselineChange() {
      refresh();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === 'bini:visit-baseline-v1') refresh();
    }
    window.addEventListener(VISIT_BASELINE_CHANGE_EVENT, onBaselineChange);
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(VISIT_BASELINE_CHANGE_EVENT, onBaselineChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function markAsRead() {
    setVisitBaseline(new Date().toISOString());
    setCount(0);
  }

  if (!count || count <= 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
      <span className="font-medium text-blue-800">
        ✨ 지난 방문 이후 신규 {count.toLocaleString()}건
      </span>
      {since && (
        <span className="text-xs text-blue-600/80">
          ({new Date(since).toLocaleString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })} 이후)
        </span>
      )}
      <button
        type="button"
        onClick={markAsRead}
        className="ml-auto rounded border border-blue-300 bg-white/60 px-2 py-0.5 text-xs text-blue-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        title="현재 시각을 기준으로 다시 카운트 시작"
      >
        ✕ 본 걸로 표시
      </button>
    </div>
  );
}
