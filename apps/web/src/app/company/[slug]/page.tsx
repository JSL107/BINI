import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchCompanyByName } from '../../../lib/api';
import { JobCard } from '../../../components/JobCard';

const SOURCE_LABEL: Record<string, string> = {
  gamejob: '게임잡',
  wanted: '원티드',
  jobkorea: '잡코리아',
  saramin: '사람인',
  incruit: '인크루트',
};

function jobplanetSearchUrl(company: string): string {
  return `https://www.jobplanet.co.kr/search?query_type=company&query=${encodeURIComponent(company)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = safeDecode(slug);
  return {
    title: `${name} 채용 · BINI`,
    description: `${name}의 게임 원화 채용 공고 통합 (게임잡·원티드·잡코리아·사람인·인크루트)`,
  };
}

function safeDecode(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = safeDecode(slug);
  const data = await fetchCompanyByName(name);
  if (!data) notFound();

  const activeJobs = data.jobs.filter((j) => !j.expired);
  const expiredJobs = data.jobs.filter((j) => j.expired);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-4 text-sm">
        <Link href="/" className="text-gray-600 hover:text-gray-900 hover:underline">
          공고 목록
        </Link>
        <Link
          href="/companies"
          className="text-gray-600 hover:text-gray-900 hover:underline"
        >
          회사 채용 페이지
        </Link>
        <Link href="/stats" className="text-gray-600 hover:text-gray-900 hover:underline">
          통계
        </Link>
        <Link
          href="/portfolio"
          className="text-gray-600 hover:text-gray-900 hover:underline"
        >
          포트폴리오
        </Link>
      </nav>

      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {data.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.logoUrl}
            alt={`${data.name} 로고`}
            className="h-16 w-16 rounded-lg border border-gray-200 object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-xs text-gray-400">
            로고 없음
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>BINI 잡 {data.jobs.length}건 · 활성 {activeJobs.length} / 종료 {expiredJobs.length}</span>
            {data.sources.length > 0 && (
              <span className="text-gray-400">
                · 소스: {data.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <a
              href={data.jobplanet?.url ?? jobplanetSearchUrl(data.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              잡플래닛 {data.jobplanet?.url ? '회사 페이지' : '평판'} ↗
            </a>
            {data.externalCareerUrl && (
              <a
                href={data.externalCareerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                원본 채용 페이지 ↗
              </a>
            )}
          </div>
        </div>
      </header>

      {data.jobplanet && data.jobplanet.rating !== null && (
        <section
          aria-label="잡플래닛 평판 요약"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-700">
                ★ {data.jobplanet.rating.toFixed(1)}
              </span>
              <span className="text-xs text-gray-500">/ 5.0</span>
            </div>
            {data.jobplanet.reviewCount !== null && (
              <div className="text-sm text-gray-700">
                <span className="font-medium">{data.jobplanet.reviewCount.toLocaleString()}</span>
                <span className="ml-1 text-gray-500">개의 기업리뷰</span>
              </div>
            )}
            {data.jobplanet.salaryAvg !== null && (
              <div className="text-sm text-gray-700">
                <span className="text-gray-500">평균연봉</span>
                <span className="ml-1 font-medium">
                  {data.jobplanet.salaryAvg.toLocaleString()}만 원
                </span>
              </div>
            )}
            {data.jobplanet.url && (
              <a
                href={data.jobplanet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto rounded text-sm text-amber-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                잡플래닛에서 더 보기 ↗
              </a>
            )}
          </div>
          {data.jobplanet.fetchedAt && (
            <p className="mt-2 text-xs text-gray-400">
              잡플래닛 캐시 — {new Date(data.jobplanet.fetchedAt).toLocaleDateString('ko-KR')} 수집
            </p>
          )}
        </section>
      )}

      {data.representativeGames.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">대표게임</h2>
          <div className="flex flex-wrap gap-2">
            {data.representativeGames.map((g) => (
              <span
                key={g}
                className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
              >
                {g}
              </span>
            ))}
          </div>
        </section>
      )}

      {data.photos.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">회사 사진</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.photos.slice(0, 8).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`${data.name} 회사 사진 ${i + 1}`}
                className="h-32 w-full rounded border border-gray-200 object-cover"
              />
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          채용 공고 <span className="ml-1 text-sm text-gray-400">({data.jobs.length})</span>
        </h2>
        {data.jobs.length === 0 ? (
          <p className="text-sm text-gray-500">현재 등록된 공고가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
