'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Job, JobSource } from '@bini/types';
import { JobImageCarousel } from './JobImageCarousel';
import { CompanyAvatar } from './CompanyAvatar';
import { PortfolioMatchBadge } from './PortfolioMatchBadge';
import { deadlineBadge, deadlineStatusFromJob } from '../lib/deadline';
import {
  SEEN_JOBS_CHANGE_EVENT,
  STORAGE_KEY as SEEN_JOBS_STORAGE_KEY,
  isJobSeen,
  loadSeenJobs,
  markJobAsSeen,
} from '../lib/seen-jobs';

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

/**
 * 크롤러가 잡플래닛 deep link를 못 잡은(드물지만 발생) 경우의 폴백.
 * 별점 자체는 있지만 url=null인 경우에만 사용한다.
 */
function jobplanetSearchUrl(company: string): string {
  return `https://www.jobplanet.co.kr/search?query_type=company&query=${encodeURIComponent(company)}`;
}

/**
 * 잡플래닛 별점에 대응하는 카드 색조. 5점 만점 기준의 보수적 분기.
 * - 4.0+ : 녹색(우수)
 * - 3.0~4.0 : 호박색(보통)
 * - 3.0 미만 : 회색(낮음 — 강조 안 함)
 */
function ratingTone(rating: number): string {
  if (rating >= 4.0) return 'bg-emerald-50 text-emerald-700';
  if (rating >= 3.0) return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

/** 한 카드에 표시할 태그 상한. 초과분은 +N 인디케이터로 압축. */
const TAG_DISPLAY_CAP = 5;

export function JobCard({ job }: { job: Job }) {
  // 서버 cron이 채워둔 job.deadlineAt을 우선 사용. NULL이면 원본 텍스트로 폴백.
  const deadline = deadlineStatusFromJob(job);
  const badge = deadlineBadge(deadline);

  // 사용자가 이 잡 상세 링크를 클릭한 적 있는지 — localStorage 기반.
  // SSR에선 false → hydration 후 useEffect로 실제 상태 반영(첫 paint flicker 허용).
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    function refresh() {
      setSeen(isJobSeen(loadSeenJobs(), job.id));
    }
    refresh();
    function onStorage(e: StorageEvent) {
      if (e.key === SEEN_JOBS_STORAGE_KEY) refresh();
    }
    // 'storage'는 다른 탭, custom 이벤트는 같은 탭(즉시 반영).
    window.addEventListener('storage', onStorage);
    window.addEventListener(SEEN_JOBS_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SEEN_JOBS_CHANGE_EVENT, refresh);
    };
  }, [job.id]);

  return (
    <article
      className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ${job.expired ? 'opacity-60' : ''}`}
    >
      <div className="relative">
        <JobImageCarousel
          jobId={job.id}
          fallbackQuery={job.imageQuery}
          fallbackType={job.imageQueryType}
          alt={job.title}
        />
        {seen && (
          <span
            className="absolute right-2 top-2 z-10 rounded-md bg-emerald-500/95 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm ring-1 ring-emerald-600/30"
            title="이 공고의 상세 링크를 이전에 열어본 적이 있습니다 (이 브라우저 기준)"
            aria-label="본 적 있는 공고"
          >
            본적있음
          </span>
        )}
      </div>
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
          {/* 잡플래닛 평판 — 별점 데이터가 실제로 있을 때만 노출. 크롤러가 못 잡은
              회사엔 "잡플래닛 ↗" 검색 폴백 링크를 띄우지 않는다(카드 잡음 감소). */}
          {job.jobplanet?.rating != null && (
            <a
              href={job.jobplanet.url ?? jobplanetSearchUrl(job.company)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={
                job.jobplanet.reviewCount != null
                  ? `잡플래닛 ★${job.jobplanet.rating.toFixed(1)} · 리뷰 ${job.jobplanet.reviewCount.toLocaleString()}건`
                  : `잡플래닛 ★${job.jobplanet.rating.toFixed(1)}`
              }
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${ratingTone(job.jobplanet.rating)} hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
            >
              ★ {job.jobplanet.rating.toFixed(1)}
              {job.jobplanet.reviewCount != null && job.jobplanet.reviewCount > 0 && (
                <span className="ml-1 opacity-70">
                  ({job.jobplanet.reviewCount.toLocaleString()})
                </span>
              )}
            </a>
          )}
          <PortfolioMatchBadge job={job} />
        </div>
        <a
          href={job.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markJobAsSeen(job.id)}
          className="block font-semibold text-gray-900 hover:underline"
        >
          {job.title}
        </a>
        <div className="flex flex-wrap gap-1">
          {job.tags.slice(0, TAG_DISPLAY_CAP).map((tag, i) => (
            <span
              key={`${i}-${tag}`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {tag}
            </span>
          ))}
          {job.tags.length > TAG_DISPLAY_CAP && (
            <span
              className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
              title={job.tags.slice(TAG_DISPLAY_CAP).join(' · ')}
            >
              +{job.tags.length - TAG_DISPLAY_CAP}
            </span>
          )}
        </div>
        {/* 마감 텍스트 — 상단 D-day 뱃지가 urgent/soon/expired는 이미 강조하므로
            여기엔 그 외 케이스만 명시한다. 중복 노이즈 제거. */}
        {deadline.kind === 'always' ? (
          <p className="text-xs text-gray-400">상시 채용</p>
        ) : deadline.kind === 'parsed' && deadline.date ? (
          <p className="text-xs text-gray-400">
            마감{' '}
            {deadline.date.toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
            })}
          </p>
        ) : deadline.kind === 'unknown' ? (
          <p className="text-xs text-gray-400">마감 {job.deadline}</p>
        ) : null}
      </div>
    </article>
  );
}
