import { fetchJobs } from '../lib/api';
import { JobsGridWithFilter } from '../components/JobsGridWithFilter';
import { Pagination } from '../components/Pagination';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q: qParam } = await searchParams;
  const parsed = parseInt(pageParam ?? '1', 10);
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  const search = (qParam ?? '').trim().slice(0, 200);

  const data = await fetchJobs(page, search || undefined);

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
      <Pagination page={data.page} totalPages={data.totalPages} search={search || undefined} />
    </main>
  );
}
