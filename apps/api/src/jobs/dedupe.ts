import type { AlternateSource } from '@bini/types';
import type { RawJob } from '../scraper/raw-job';

/** dedup 키 생성용 정규화. 공백·대괄호·소괄호·기호를 제거하고 lowercase. */
export function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\[\]()\-_/,.·•:]/g, '')
    .trim();
}

/**
 * company+title을 정규화해 dedup 키를 만든다.
 * cron이 DB `Job.normalizedKey` 컬럼에 동일 값을 채워두기 때문에 페이지네이션을 넘어서도
 * 같은 잡은 같은 키를 공유하고, primary/alias 관계가 영속화된다.
 */
export function makeNormalizedKey(company: string, title: string): string {
  return `${normalizeForDedup(company)} ${normalizeForDedup(title)}`;
}

/**
 * 입력 순서를 보존한 group. `primary`는 그룹 내 첫 등장 RawJob (정렬 책임은 호출자),
 * `members`는 primary 포함 전체. cron이 모든 member에 대해 upsert를 만들기 위해 필요.
 */
export interface RawJobGroup {
  primary: RawJob;
  normalizedKey: string;
  members: RawJob[];
}

/** 정규화 키 기준으로 RawJob 배열을 그룹화. 입력 순서 보존. */
export function groupRawJobs(jobs: RawJob[]): RawJobGroup[] {
  const map = new Map<string, RawJobGroup>();
  for (const job of jobs) {
    const key = makeNormalizedKey(job.company, job.title);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { primary: job, normalizedKey: key, members: [job] });
    } else {
      existing.members.push(job);
    }
  }
  return Array.from(map.values());
}

export interface DedupedJob extends RawJob {
  alternateSources: AlternateSource[];
  /** 그룹의 dedup 키. cron이 DB 컬럼화에 사용. */
  normalizedKey: string;
}

/**
 * 회사명+제목 정규화 기반으로 다중 소스 raw 공고를 중복 제거한다.
 * - 동일 키 충돌 시 입력 순서상 첫 등장 공고를 primary로 채택
 * - 나머지는 primary.alternateSources에 source/detailUrl만 보존
 * - 호출자는 등록일순 등 원하는 우선순위로 입력 순서를 미리 정렬하는 책임을 진다.
 */
export function dedupeJobs(jobs: RawJob[]): DedupedJob[] {
  return groupRawJobs(jobs).map((g) => ({
    ...g.primary,
    normalizedKey: g.normalizedKey,
    alternateSources: g.members.slice(1).map((m) => ({
      source: m.source,
      detailUrl: m.detailUrl,
    })),
  }));
}
