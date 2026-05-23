import type { Job } from '@bini/types';
import { JobImageCarousel } from './JobImageCarousel';
import { CompanyAvatar } from './CompanyAvatar';

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <JobImageCarousel
        jobId={job.id}
        fallbackQuery={job.imageQuery}
        fallbackType={job.imageQueryType}
        alt={job.title}
      />
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <CompanyAvatar logoUrl={job.companyLogoUrl} name={job.company} />
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
