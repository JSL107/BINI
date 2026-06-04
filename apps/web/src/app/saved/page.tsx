'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { JobCard } from '../../components/JobCard';
import { SavedJobMetaEditor } from '../../components/SavedJobMetaEditor';
import {
  SAVED_APPLICATION_STATUSES,
  SAVED_APPLICATION_STATUS_LABELS,
  SAVED_JOBS_CHANGE_EVENT,
  STORAGE_KEY as SAVED_STORAGE_KEY,
  type SavedApplicationStatus,
  listSavedJobsByRecent,
  loadSavedJobs,
  type SavedEntry,
} from '../../lib/saved-jobs';

/**
 * "N분/시간/일 전 스크랩" — 절대 시각보다 상대 표시가 사용자가 "최근에/오래 전에
 * 저장했나" 즉시 파악하기 쉽다. 60d 이상은 'YYYY-MM-DD' 절대 날짜로 폴백.
 */
function formatSavedAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  if (diffMs < 60_000) return '방금 전';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}일 전`;
  return new Date(epochMs).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  function onStorage(e: StorageEvent) {
    if (e.key === SAVED_STORAGE_KEY) callback();
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener(SAVED_JOBS_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SAVED_JOBS_CHANGE_EVENT, callback);
  };
}

// useSyncExternalStore는 snapshot 참조 동등성으로 리렌더를 결정한다. 매번 새
// 배열을 반환하면 무한 루프 — raw 문자열을 캐시 키로 두고 변경 없을 땐 동일
// 참조를 그대로 돌려준다.
let cachedRaw: string | null | undefined;
let cachedSnap: SavedEntry[] = [];
function getSnapshot(): SavedEntry[] {
  const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnap;
  cachedRaw = raw;
  cachedSnap = listSavedJobsByRecent(loadSavedJobs());
  return cachedSnap;
}
function getServerSnapshot(): SavedEntry[] {
  return [];
}

type StatusFilter = 'all' | SavedApplicationStatus;

const STATUS_FILTER_CHIP: Record<StatusFilter, string> = {
  all: 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
  considering: 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
  applied: 'bg-white text-sky-700 ring-sky-200 hover:bg-sky-50',
  interview: 'bg-white text-violet-700 ring-violet-200 hover:bg-violet-50',
  rejected: 'bg-white text-rose-700 ring-rose-200 hover:bg-rose-50',
  offered: 'bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50',
};
const STATUS_FILTER_CHIP_ACTIVE: Record<StatusFilter, string> = {
  all: 'bg-gray-800 text-white ring-gray-800',
  considering: 'bg-gray-700 text-white ring-gray-700',
  applied: 'bg-sky-600 text-white ring-sky-600',
  interview: 'bg-violet-600 text-white ring-violet-600',
  rejected: 'bg-rose-600 text-white ring-rose-600',
  offered: 'bg-emerald-600 text-white ring-emerald-600',
};

/**
 * 스크랩한 공고만 모아보는 페이지. 100% localStorage 기반 — 서버 통신 0.
 *
 * useSyncExternalStore로 SSR/hydration-safe 구독: 서버에선 빈 배열, 클라이언트
 * hydration 직후 실제 목록 노출. 'storage' + custom event 양쪽 구독해 다른
 * 탭/카드의 토글 변경 즉시 반영.
 *
 * 카드별 메타 편집기(SavedJobMetaEditor)로 상태(검토중/지원/면접/탈락/합격)와
 * 메모를 저장 — 상단 chip으로 상태별 필터링.
 *
 * 스크랩 시점에 Job snapshot을 통째 저장했기에 카드의 잡플래닛 별점·이미지 ID 등
 * 모든 정보가 그대로 보존된다(원본이 갱신돼도 스크랩 시점 값 유지).
 */
export default function SavedJobsPage() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    // 'use client' 페이지라 metadata export 불가. document.title을 직접 갱신해
    // 브라우저 탭 구분(여러 페이지 열어둘 때 식별성).
    document.title = '스크랩한 공고 · BINI';
  }, []);

  // 상태별 카운트. 미설정은 'considering'에 포함.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: entries.length,
      considering: 0,
      applied: 0,
      interview: 0,
      rejected: 0,
      offered: 0,
    };
    for (const e of entries) c[e.status ?? 'considering']++;
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => (e.status ?? 'considering') === filter);
  }, [entries, filter]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/" className="text-gray-600 hover:text-gray-900 hover:underline">
          공고 목록
        </Link>
        <Link href="/companies" className="text-gray-600 hover:text-gray-900 hover:underline">
          회사 채용 페이지
        </Link>
        <Link href="/stats" className="text-gray-600 hover:text-gray-900 hover:underline">
          통계
        </Link>
        <Link href="/portfolio" className="text-gray-600 hover:text-gray-900 hover:underline">
          포트폴리오
        </Link>
        <Link href="/calendar" className="text-gray-600 hover:text-gray-900 hover:underline">
          캘린더
        </Link>
        <span className="font-semibold text-gray-900">스크랩</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">스크랩한 공고</h1>
        <p className="mt-2 text-sm text-gray-600">
          이 브라우저에 별표 처리한 공고만 모여 있어요. 다른 기기·시크릿 모드에선 안 보입니다.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          ⓘ 카드 정보는 <strong>스크랩 시점 기준</strong>입니다. 마감일·평점 등은 그 사이 갱신됐을 수 있으니
          최신 상태는 카드의 외부 링크에서 확인하세요.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-600">
            아직 스크랩한 공고가 없습니다. 카드 좌측 상단의 별 아이콘을 눌러 보세요.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            공고 목록 보러 가기
          </Link>
        </div>
      ) : (
        <>
          {/* radiogroup 패턴 — tab은 aria-controls + tabpanel을 요구하나 여기선
              필터된 그리드가 별도 panel 구조가 아니라 단일 단상 콘텐츠라 radio가 의미상 맞다. */}
          <div
            role="radiogroup"
            aria-label="상태 필터"
            className="mb-3 flex flex-wrap items-center gap-1.5"
          >
            {(['all', ...SAVED_APPLICATION_STATUSES] as const).map((key) => {
              const active = filter === key;
              const cls = active ? STATUS_FILTER_CHIP_ACTIVE[key] : STATUS_FILTER_CHIP[key];
              const label =
                key === 'all' ? '전체' : SAVED_APPLICATION_STATUS_LABELS[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${cls}`}
                >
                  {label} <span className="ml-1 opacity-75">{counts[key]}</span>
                </button>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
              이 상태에 해당하는 스크랩 공고가 없습니다.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500">
                {filter === 'all'
                  ? `총 ${filtered.length}건 (최근 스크랩순)`
                  : `${SAVED_APPLICATION_STATUS_LABELS[filter]} ${filtered.length}건 (최근 스크랩순)`}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((e, i) => (
                  <div key={e.job.id} className="flex flex-col gap-2">
                    {/* idx<3 첫 줄 카드만 priority — 메인 페이지와 동일 정책. */}
                    <JobCard job={e.job} priority={i < 3} />
                    <p className="px-1 text-[11px] text-gray-400">
                      <time dateTime={new Date(e.savedAt).toISOString()}>
                        {formatSavedAgo(e.savedAt)}
                      </time>{' '}
                      · 스크랩 시점 정보
                    </p>
                    <SavedJobMetaEditor
                      job={e.job}
                      note={e.note}
                      status={e.status}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
