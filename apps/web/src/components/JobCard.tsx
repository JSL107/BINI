import type { Job } from '@bini/types';
import { GameImage } from './GameImage';

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <GameImage query={job.imageQuery} type={job.imageQueryType} />
      <div className="space-y-2 p-4">
        <p className="text-sm text-gray-500">{job.company}</p>
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
