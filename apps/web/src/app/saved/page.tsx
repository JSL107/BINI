'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { JobCard } from '../../components/JobCard';
import {
  SAVED_JOBS_CHANGE_EVENT,
  STORAGE_KEY as SAVED_STORAGE_KEY,
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

/**
 * 스크랩한 공고만 모아보는 페이지. 100% localStorage 기반 — 서버 통신 0.
 *
 * useSyncExternalStore로 SSR/hydration-safe 구독: 서버에선 빈 배열, 클라이언트
 * hydration 직후 실제 목록 노출. 'storage' + custom event 양쪽 구독해 다른
 * 탭/카드의 토글 변경 즉시 반영.
 *
 * 스크랩 시점에 Job snapshot을 통째 저장했기에 카드의 잡플래닛 별점·이미지 ID 등
 * 모든 정보가 그대로 보존된다(원본이 갱신돼도 스크랩 시점 값 유지).
 */
export default function SavedJobsPage() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // 'use client' 페이지라 metadata export 불가. document.title을 직접 갱신해
    // 브라우저 탭 구분(여러 페이지 열어둘 때 식별성).
    document.title = '스크랩한 공고 · BINI';
  }, []);

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
          <p className="mb-4 text-sm text-gray-500">
            총 {entries.length}건 (최근 스크랩순)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((e) => (
              <div key={e.job.id} className="flex flex-col gap-1">
                <JobCard job={e.job} />
                <p className="px-1 text-[11px] text-gray-400">
                  <time dateTime={new Date(e.savedAt).toISOString()}>
                    {formatSavedAgo(e.savedAt)}
                  </time>{' '}
                  · 스크랩 시점 정보
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
