import type { CareerSiteLink, CareerSitesResponse } from '@bini/types';
import { getCareerSites } from '../../lib/api';

export const revalidate = 3600;

export default async function CompaniesPage() {
  let data: CareerSitesResponse;
  try {
    data = await getCareerSites();
  } catch (err) {
    // 빌드 시점이나 API 미가용 시 빈 응답으로 폴백 (ISR이 1시간 뒤 재시도)
    data = {
      sites: [],
      source: 'github:GameForPeople/korea-game-career-site',
      fetchedAt: new Date().toISOString(),
    };
  }
  const companies = data.sites.filter((s) => s.category === 'company');
  const jobBoards = data.sites.filter((s) => s.category === 'jobBoard');
  const info = data.sites.filter((s) => s.category === 'companyInfo');

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">게임 회사 채용 페이지</h1>
        <p className="mt-2 text-sm text-gray-500">
          출처:{' '}
          <a
            className="underline"
            href="https://github.com/GameForPeople/korea-game-career-site"
            target="_blank"
            rel="noopener noreferrer"
          >
            GameForPeople/korea-game-career-site
          </a>{' '}
          — 마지막 갱신 {new Date(data.fetchedAt).toLocaleString('ko-KR')}
        </p>
      </header>

      {data.sites.length === 0 ? (
        <p className="text-sm text-gray-500">데이터를 불러오는 중입니다. 잠시 후 새로고침해 주세요.</p>
      ) : (
        <>
          <Section title="자체 채용 사이트" sites={companies} />
          <Section title="관련 채용 사이트" sites={jobBoards} />
          <Section title="기업 정보 사이트" sites={info} />
        </>
      )}
    </main>
  );
}

function Section({ title, sites }: { title: string; sites: CareerSiteLink[] }) {
  if (sites.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold text-gray-800">
        {title} <span className="ml-1 text-sm text-gray-400">({sites.length})</span>
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {sites.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm hover:bg-blue-50 hover:underline"
              title={s.url}
            >
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
