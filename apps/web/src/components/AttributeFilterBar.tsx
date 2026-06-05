'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import type { EmploymentType, ExperienceLevel } from '@bini/types';

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  newcomer: '신입',
  junior: '주니어',
  mid: '미들',
  senior: '시니어',
  any: '경력',
};
const EXPERIENCE_ORDER: ExperienceLevel[] = ['newcomer', 'junior', 'mid', 'senior', 'any'];

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  fulltime: '정규직',
  contract: '계약직',
  parttime: '파트타임',
  freelance: '외주/프리랜서',
  intern: '인턴',
};
const EMPLOYMENT_ORDER: EmploymentType[] = [
  'fulltime',
  'contract',
  'parttime',
  'freelance',
  'intern',
];

const LOCATION_LABELS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

function csvToSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * 활성 필터 상태를 서버 Page(searchParams prop)에서 받아 표시하는 필터 칩.
 *
 * useSearchParams를 의도적으로 쓰지 않는다 — 그 훅은 SSR에서 가장 가까운 Suspense
 * 경계까지를 client-side 렌더로 bailout시켜, 필터바가 SSR HTML에 fallback(빈 박스)으로
 * 들어갔다가 hydration 시 실제 칩(모바일에선 수백 px)으로 교체되며 큰 CLS를 유발했다.
 * 대신 Page가 이미 파싱한 값을 prop으로 받아 client 컴포넌트로 정상 SSR된다(CLS=0).
 * (Next 16 권장: 서버 Page의 searchParams prop을 자식에 내려보낼 것.)
 *
 * 토글은 useRouter().push로 URL을 갱신 — push 후 Page가 새 searchParams로 재렌더되어
 * 새 prop이 흘러온다. page는 항상 1로 리셋(필터가 바뀌면 기존 페이지 번호는 무의미).
 * 소스 칩(JobsGridWithFilter)은 별개 — 현재 페이지 내 클라이언트 필터로 그대로 둔다.
 */
export interface AttributeFilterBarProps {
  /** 현재 활성 연차 CSV (예: "newcomer,senior"). Page의 searchParams에서 파싱해 전달. */
  experience: string;
  /** 현재 활성 고용형태 CSV. */
  employmentType: string;
  /** 현재 활성 지역 CSV. */
  location: string;
  /** 재택/원격 활성 여부. */
  remote: boolean;
  /** 토글 시 보존할 검색어(q). 속성 필터가 아니므로 초기화에도 남는다. */
  search?: string;
  /** 토글 시 보존할 정렬. 'recent'(기본)는 URL에 싣지 않는다. */
  sort?: string;
}

export function AttributeFilterBar({
  experience,
  employmentType,
  location,
  remote,
  search,
  sort,
}: AttributeFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const activeExp = csvToSet(experience);
  const activeEmp = csvToSet(employmentType);
  const activeLoc = csvToSet(location);
  const activeRemote = remote;

  // 현재 활성 상태(prop)로부터 쿼리스트링을 재구성 — useSearchParams 없이 동작.
  function currentParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (experience) p.set('experience', experience);
    if (employmentType) p.set('employmentType', employmentType);
    if (location) p.set('location', location);
    if (remote) p.set('remote', 'true');
    if (sort && sort !== 'recent') p.set('sort', sort);
    return p;
  }

  function pushWith(updater: (params: URLSearchParams) => void) {
    const next = currentParams();
    updater(next);
    next.delete('page'); // 필터 변경 시 페이지 리셋
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function toggleInSet(key: string, value: string) {
    pushWith((params) => {
      const set = csvToSet(params.get(key));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size === 0) params.delete(key);
      else params.set(key, Array.from(set).join(','));
    });
  }

  function toggleRemote() {
    pushWith((params) => {
      if (params.get('remote') === 'true') params.delete('remote');
      else params.set('remote', 'true');
    });
  }

  function resetAll() {
    pushWith((params) => {
      params.delete('experience');
      params.delete('employmentType');
      params.delete('location');
      params.delete('remote');
    });
  }

  const hasAny =
    activeExp.size > 0 || activeEmp.size > 0 || activeLoc.size > 0 || activeRemote;

  return (
    <div
      className={`mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 ${
        isPending ? 'opacity-60' : ''
      }`}
      aria-busy={isPending}
    >
      <FilterGroup title="연차" labelMap={EXPERIENCE_LABELS} order={EXPERIENCE_ORDER}
        active={activeExp} onToggle={(v) => toggleInSet('experience', v)} colorClass="bg-indigo-600" />
      <FilterGroup title="고용형태" labelMap={EMPLOYMENT_LABELS} order={EMPLOYMENT_ORDER}
        active={activeEmp} onToggle={(v) => toggleInSet('employmentType', v)} colorClass="bg-emerald-600" />
      <LocationGroup active={activeLoc} onToggle={(v) => toggleInSet('location', v)} />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleRemote}
          aria-pressed={activeRemote}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            activeRemote
              ? 'border-amber-600 bg-amber-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          재택/원격 가능
        </button>
        {hasAny && (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}

function FilterGroup<K extends string>({
  title,
  labelMap,
  order,
  active,
  onToggle,
  colorClass,
}: {
  title: string;
  labelMap: Record<K, string>;
  order: K[];
  active: Set<string>;
  onToggle: (value: K) => void;
  colorClass: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-gray-500">{title}</p>
      <div role="group" aria-label={title} className="flex flex-wrap items-center gap-2">
        {order.map((key) => {
          const isActive = active.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={isActive}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? `border-transparent text-white ${colorClass}`
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {labelMap[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LocationGroup({
  active,
  onToggle,
}: {
  active: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-gray-500">지역</p>
      <div role="group" aria-label="지역" className="flex flex-wrap items-center gap-2">
        {LOCATION_LABELS.map((loc) => {
          const isActive = active.has(loc);
          return (
            <button
              key={loc}
              type="button"
              onClick={() => onToggle(loc)}
              aria-pressed={isActive}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-transparent bg-sky-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {loc}
            </button>
          );
        })}
      </div>
    </div>
  );
}
