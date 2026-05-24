import Link from 'next/link';
import type { Job, JobSource } from '@bini/types';
import { JobImageCarousel } from './JobImageCarousel';
import { CompanyAvatar } from './CompanyAvatar';
import { deadlineBadge, parseDeadline } from '../lib/deadline';

const SOURCE_LABEL: Record<JobSource, string> = {
  gamejob: '게임잡',
  wanted: '원티드',
  jobkorea: '잡코리아',
  saramin: '사람인',
  incruit: '인크루트',
};

const SOURCE_COLOR: Record<JobSource, string> = {
  gamejob: 'bg-blue-100 text-blue-700',
  wanted: 'bg-purple-100 text-purple-700',
  jobkorea: 'bg-green-100 text-green-700',
  saramin: 'bg-amber-100 text-amber-700',
  incruit: 'bg-pink-100 text-pink-700',
};

function jobplanetSearchUrl(company: string): string {
  return `https://www.jobplanet.co.kr/search?query_type=company&query=${encodeURIComponent(company)}`;
}

export function JobCard({ job }: { job: Job }) {
  const deadline = parseDeadline(job.deadline);
  const badge = deadlineBadge(deadline);
  return (
    <article
      className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ${job.expired ? 'opacity-60' : ''}`}
    >
      <JobImageCarousel
        jobId={job.id}
        fallbackQuery={job.imageQuery}
        fallbackType={job.imageQueryType}
        alt={job.title}
      />
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CompanyAvatar logoUrl={job.companyLogoUrl} name={job.company} />
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${SOURCE_COLOR[job.source]}`}
          >
            {SOURCE_LABEL[job.source]}
            {job.alternateSources.length > 0 && (
              <span className="ml-1 opacity-70">+{job.alternateSources.length}</span>
            )}
          </span>
          {job.expired ? (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">
              마감
            </span>
          ) : badge === 'urgent' ? (
            <span
              className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700"
              title={deadline.date?.toLocaleDateString('ko-KR')}
            >
              D-{deadline.daysRemaining}
            </span>
          ) : badge === 'soon' ? (
            <span
              className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700"
              title={deadline.date?.toLocaleDateString('ko-KR')}
            >
              D-{deadline.daysRemaining}
            </span>
          ) : null}
          <Link
            href={`/company/${encodeURIComponent(job.company)}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded text-sm text-gray-700 hover:text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            title={`${job.company} 회사 페이지 보기`}
          >
            {job.company}
          </Link>
          {/* 잡플래닛 회사 검색 — 회사 평판·연봉·면접 정보 빠른 진입 */}
          <a
            href={jobplanetSearchUrl(job.company)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`${job.company} 잡플래닛 평판 보기`}
            className="rounded text-xs text-gray-500 hover:text-blue-600 hover:underline focus:outline-none focus-visible:text-blue-700 focus-visible:underline focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
          >
            잡플래닛 ↗
          </a>
        </div>
        <a
          href={job.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-semibold text-gray-900 hover:underline"
        >
          {job.title}
        </a>
        <div className="flex flex-wrap gap-1">
          {job.tags.map((tag, i) => (
            <span
              key={`${i}-${tag}`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400">마감 {job.deadline}</p>
      </div>
    </article>
  );
}
