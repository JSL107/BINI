import type { AlternateSource } from '@bini/types';
import type { RawJob } from '../scraper/raw-job';

/** dedup 키 생성용 정규화. 공백·대괄호·소괄호·기호를 제거하고 lowercase. */
export function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\[\]()\-_/,.·•:]/g, '')
    .trim();
}

export interface DedupedJob extends RawJob {
  alternateSources: AlternateSource[];
}

/**
 * 회사명+제목 정규화 기반으로 다중 소스 raw 공고를 중복 제거한다.
 * - 동일 키 충돌 시 입력 순서상 첫 등장 공고를 primary로 채택
 * - 나머지는 primary.alternateSources에 source/detailUrl만 보존
 * - 호출자는 등록일순 등 원하는 우선순위로 입력 순서를 미리 정렬하는 책임을 진다.
 */
export function dedupeJobs(jobs: RawJob[]): DedupedJob[] {
  const map = new Map<string, DedupedJob>();
  for (const job of jobs) {
    const key = `${normalizeForDedup(job.company)} ${normalizeForDedup(job.title)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...job, alternateSources: [] });
    } else {
      existing.alternateSources.push({
        source: job.source,
        detailUrl: job.detailUrl,
      });
    }
  }
  return Array.from(map.values());
}
