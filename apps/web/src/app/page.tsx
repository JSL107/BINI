import { fetchJobs } from '../lib/api';
import { JobsGridWithFilter } from '../components/JobsGridWithFilter';
import { Pagination } from '../components/Pagination';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const parsed = parseInt(pageParam ?? '1', 10);
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

  const data = await fetchJobs(page);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-4 text-sm">
        <a href="/" className="font-semibold text-gray-900">
          공고 목록
        </a>
        <a href="/companies" className="text-gray-600 hover:text-gray-900 hover:underline">
          회사 채용 페이지
        </a>
      </nav>
      <h1 className="mb-6 text-2xl font-bold">게임 원화 채용공고</h1>
      {data.jobs.length === 0 ? (
        <p className="text-gray-500">공고가 없습니다.</p>
      ) : (
        <JobsGridWithFilter jobs={data.jobs} />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} />
    </main>
  );
}
