'use client';

import { useEffect, useState } from 'react';
import type { Job } from '@bini/types';
import {
  SAVED_JOBS_CHANGE_EVENT,
  STORAGE_KEY as SAVED_STORAGE_KEY,
  isJobSaved,
  loadSavedJobs,
  saveJob,
  unsaveJob,
} from '../lib/saved-jobs';

/**
 * 카드 우측 상단의 별 아이콘. 토글로 스크랩/해제. localStorage 기반이라
 * 이 브라우저에서만 유지. SSR에선 false → useEffect로 hydration 후 실제 상태.
 *
 * 다른 탭/다른 컴포넌트 동기화: 'storage' + 'bini:saved-jobs-changed'.
 */
export function SaveJobButton({ job }: { job: Job }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    function refresh() {
      setSaved(isJobSaved(loadSavedJobs(), job.id));
    }
    refresh();
    function onStorage(e: StorageEvent) {
      if (e.key === SAVED_STORAGE_KEY) refresh();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAVED_JOBS_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAVED_JOBS_CHANGE_EVENT, refresh);
    };
  }, [job.id]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // 쓰기 실패(QuotaExceeded 등) 시 UI를 낙관적으로 토글하지 않는다 —
    // 별 채워졌는데 실제는 미저장인 상태를 만들지 않기 위함. 성공 시에만 setSaved.
    if (saved) {
      const ok = unsaveJob(job.id);
      if (ok) setSaved(false);
    } else {
      const ok = saveJob(job);
      if (ok) setSaved(true);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? '스크랩 해제' : '스크랩'}
      title={saved ? '스크랩 해제' : '스크랩 (이 브라우저에 저장)'}
      className={`absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        saved
          ? 'bg-amber-400/95 text-white ring-amber-500/40 hover:bg-amber-500'
          : 'bg-white/90 text-gray-500 ring-gray-200 hover:bg-white hover:text-amber-500'
      }`}
    >
      {/* 별 아이콘 — 채워진/외곽선 두 가지를 같은 path로 표현하고 fill만 토글. */}
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
