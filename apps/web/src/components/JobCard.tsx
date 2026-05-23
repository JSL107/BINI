import type { Job, JobSource } from '@bini/types';
import { JobImageCarousel } from './JobImageCarousel';
import { CompanyAvatar } from './CompanyAvatar';

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

export function JobCard({ job }: { job: Job }) {
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
          {job.expired && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">
              마감
            </span>
          )}
          <p className="text-sm text-gray-500">{job.company}</p>
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
