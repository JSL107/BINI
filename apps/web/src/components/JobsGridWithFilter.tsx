'use client';

import { useMemo, useState } from 'react';
import type { Job, JobSource } from '@bini/types';
import { JobCard } from './JobCard';

const SOURCE_LABEL: Record<JobSource, string> = {
  gamejob: '게임잡',
  wanted: '원티드',
  jobkorea: '잡코리아',
  saramin: '사람인',
  incruit: '인크루트',
};

const SOURCE_ACTIVE_COLOR: Record<JobSource, string> = {
  gamejob: 'bg-blue-600 text-white border-blue-600',
  wanted: 'bg-purple-600 text-white border-purple-600',
  jobkorea: 'bg-green-600 text-white border-green-600',
  saramin: 'bg-amber-600 text-white border-amber-600',
  incruit: 'bg-pink-600 text-white border-pink-600',
};

const ALL_SOURCES: JobSource[] = ['gamejob', 'wanted', 'jobkorea', 'saramin', 'incruit'];

export function JobsGridWithFilter({ jobs }: { jobs: Job[] }) {
  const counts = useMemo(() => {
    const c: Partial<Record<JobSource, number>> = {};
    for (const j of jobs) c[j.source] = (c[j.source] ?? 0) + 1;
    return c;
  }, [jobs]);

  // 데이터에 등장한 소스만 초기 active로 둔다 — count=0 칩이 active에 남아있으면
  // "보이는 칩 전부 해제" 감지가 망가진다.
  const presentSources = useMemo(
    () => ALL_SOURCES.filter((s) => (counts[s] ?? 0) > 0),
    [counts],
  );
  const [active, setActive] = useState<Set<JobSource>>(() => new Set(presentSources));

  const toggle = (s: JobSource) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      // 보이는 칩이 전부 해제되면 다시 모두 선택 (빈 결과 방지)
      const anyVisibleActive = presentSources.some((src) => next.has(src));
      if (!anyVisibleActive) return new Set(presentSources);
      return next;
    });
  };

  const filtered = useMemo(
    () => jobs.filter((j) => active.has(j.source)),
    [jobs, active],
  );

  return (
    <>
      <div
        role="group"
        aria-label="소스 필터"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        {ALL_SOURCES.map((src) => {
          const count = counts[src] ?? 0;
          if (count === 0) return null;
          const isActive = active.has(src);
          return (
            <button
              key={src}
              type="button"
              onClick={() => toggle(src)}
              aria-pressed={isActive}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? SOURCE_ACTIVE_COLOR[src]
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {SOURCE_LABEL[src]}
              <span className={`ml-1 ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="text-gray-500">선택한 소스에 공고가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((job, i) => (
            // priority — 데스크탑 grid-cols-3 첫 줄(idx<3)만 next/image priority로
            // preload + fetchPriority="high". 나머지는 자동 lazy load. 모바일은 한 줄에
            // 1장이라 첫 카드 1개만 의미 있지만 idx<3 일괄 적용해도 추가 비용은 미미.
            <JobCard key={job.id} job={job} priority={i < 3} />
          ))}
        </div>
      )}
    </>
  );
}
