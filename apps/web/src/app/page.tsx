import { Suspense } from 'react';
import { fetchJobs, type JobsQueryOptions } from '../lib/api';
import { JobsGridWithFilter } from '../components/JobsGridWithFilter';
import { Pagination } from '../components/Pagination';
import { AttributeFilterBar } from '../components/AttributeFilterBar';

// force-dynamic 제거 — fetchJobs가 next.revalidate=30으로 캐시되므로 같은
// page+search+필터 조합은 30s 동안 Vercel Edge에서 즉시 응답. page는 searchParams
// 의존이라 자동 dynamic이지만 fetch 결과 캐시는 살아 있어 cold path만 컷.

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function splitCsv(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    experience?: string | string[];
    employmentType?: string | string[];
    location?: string | string[];
    remote?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const pageParam = firstParam(sp.page);
  const qParam = firstParam(sp.q);
  const expParam = firstParam(sp.experience);
  const empParam = firstParam(sp.employmentType);
  const locParam = firstParam(sp.location);
  const remoteParam = firstParam(sp.remote);

  const parsed = parseInt(pageParam ?? '1', 10);
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  const search = (qParam ?? '').trim().slice(0, 200);

  const opts: JobsQueryOptions = {
    search: search || undefined,
    experience: splitCsv(expParam),
    employmentType: splitCsv(empParam),
    location: splitCsv(locParam),
    remote: remoteParam === 'true',
  };

  const data = await fetchJobs(page, opts);

  // 페이지 링크가 모든 필터를 보존하도록 extraQuery 합성.
  const extraQuery: Record<string, string | undefined> = {
    experience: expParam,
    employmentType: empParam,
    location: locParam,
    remote: remoteParam === 'true' ? 'true' : undefined,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-4 text-sm">
        <a href="/" className="font-semibold text-gray-900">
          공고 목록
        </a>
        <a href="/companies" className="text-gray-600 hover:text-gray-900 hover:underline">
          회사 채용 페이지
        </a>
        <a href="/stats" className="text-gray-600 hover:text-gray-900 hover:underline">
          통계
        </a>
      </nav>
      <h1 className="mb-4 text-2xl font-bold">게임 원화 채용공고</h1>
      <form action="/" method="get" className="mb-6 flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="제목·회사명 검색"
          maxLength={200}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          검색
        </button>
        {search && (
          <a
            href="/"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            초기화
          </a>
        )}
      </form>
      {/*
        AttributeFilterBar는 useSearchParams를 쓰므로 Suspense 경계 필수.
        Next.js 16: useSearchParams 사용 client 컴포넌트가 Suspense 없이 있으면
        가장 가까운 prerender 경계가 dynamic으로 전환되고 빌드 경고를 낸다.
      */}
      <Suspense fallback={<div className="mb-4 h-32 animate-pulse rounded-lg bg-gray-100" />}>
        <AttributeFilterBar />
      </Suspense>
      {search && (
        <p className="mb-4 text-sm text-gray-500">
          “{search}” 검색 결과 — 총 {data.jobs.length}건 (페이지 {data.page} / {data.totalPages})
        </p>
      )}
      {data.jobs.length === 0 ? (
        <p className="text-gray-500">
          {search ? '검색 결과가 없습니다.' : '공고가 없습니다.'}
        </p>
      ) : (
        <JobsGridWithFilter jobs={data.jobs} />
      )}
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        search={search || undefined}
        extraQuery={extraQuery}
      />
    </main>
  );
}
