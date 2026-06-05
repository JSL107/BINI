/**
 * JobsCronService에서 추출한 순수 헬퍼 — DB row → Job DTO 변환, 쿼리 합성,
 * 시간/도메인 검증 등. 서비스 인스턴스에 의존하지 않으므로 단독 import + 테스트 가능.
 *
 * jobs-cron.service.ts가 700줄 가까이 비대해진 가운데 비즈니스 로직(스크래핑·dedup·
 * 적재 메서드)과 변환 로직이 같은 파일에 섞여 있었다. 변환 쪽만 분리.
 */

import type {
  EmploymentType,
  ExperienceLevel,
  Job,
  JobplanetSummary,
  JobSource,
  JobsSort,
} from '@bini/types';
import { expandSearchTerms } from './synonyms';

/** lastSeenAt이 이 값을 넘은 잡은 expired로 간주. sweep 임계값 + computeExpired 동적 계산 기준. */
export const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** 사용자 응답 경로(getJobsFromDb)에 적용되는 필터 옵션. 모든 항목 optional, OR 아닌 AND 결합. */
export interface JobsQuery {
  search?: string;
  experience?: ExperienceLevel[];
  employmentType?: EmploymentType[];
  /** 시도 라벨 문자열 배열. 빈 배열이면 필터 없음. */
  location?: string[];
  /** true일 때만 isRemote=true인 잡만. false/undefined면 무필터. */
  remote?: boolean;
  /** 정렬. 미지정/'recent'는 등록일 desc(기본), 'deadline-soonest'는 마감 임박순. */
  sort?: JobsSort;
}

/**
 * 정렬 옵션 → Prisma orderBy 배열 변환.
 * - 기본('recent'): 등록일 desc, id desc tiebreaker.
 * - 'deadline-soonest':
 *     1순위 `expiredAt asc nulls first` — 만료 안 된 잡(NULL)이 먼저, 만료된 잡은 뒤.
 *     2순위 `deadlineAt asc nulls last` — 임박한 마감일이 먼저, "상시"(NULL)는 뒤.
 *     3순위 `registeredAt desc` — 동일 마감일에서 최신 등록 우선.
 *     4순위 `id desc` — 안정 정렬 tiebreaker.
 *   Prisma 5+ 의 `nulls: 'first'|'last'` 옵션 사용.
 */
export function buildJobsOrderBy(
  sort: JobsSort | undefined,
): Array<Record<string, unknown>> {
  if (sort === 'deadline-soonest') {
    return [
      { expiredAt: { sort: 'asc', nulls: 'first' } },
      { deadlineAt: { sort: 'asc', nulls: 'last' } },
      { registeredAt: 'desc' },
      { id: 'desc' },
    ];
  }
  return [{ registeredAt: 'desc' }, { id: 'desc' }];
}

/** Prisma where 객체를 JobsQuery에서 합성. primaryJobId: null은 항상 강제. */
export function buildJobsWhere(opts: JobsQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { primaryJobId: null };
  const q = (opts.search ?? '').trim();
  if (q) {
    // 동의어 확장: 단일 토큰("원화")이면 같은 그룹의 단어들도 OR로 매칭한다.
    // 다중 토큰이거나 사전에 없는 단어는 그대로 한 항만 검색됨.
    const terms = expandSearchTerms(q);
    where.OR = terms.flatMap((t) => [
      { title: { contains: t, mode: 'insensitive' as const } },
      { company: { contains: t, mode: 'insensitive' as const } },
    ]);
  }
  if (opts.experience && opts.experience.length > 0) {
    where.experienceLevel = { in: opts.experience };
  }
  if (opts.employmentType && opts.employmentType.length > 0) {
    where.employmentType = { in: opts.employmentType };
  }
  if (opts.location && opts.location.length > 0) {
    where.locations = { hasSome: opts.location };
  }
  if (opts.remote === true) {
    where.isRemote = true;
  }
  return where;
}

/**
 * KST 기준 그 날의 자정(00:00:00)에 해당하는 UTC 인스턴트를 반환.
 * 캘린더 그리드의 일자 경계를 일관되게 잡기 위한 헬퍼.
 * 서버 TZ에 관계없이 동작하도록 ISO 문자열을 직접 합성.
 */
export function startOfDayKst(now: Date): Date {
  // toLocaleDateString을 ko-KR + Asia/Seoul로 호출하면 'YYYY. MM. DD.' 형태.
  // 안전하게 ISO 파싱 가능한 형태로 만들어 UTC 인스턴트로 환원한다.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA는 'YYYY-MM-DD' 출력 — KST 자정은 UTC로 전날 15:00:00.000.
  const ymd = fmt.format(now);
  // ymd + 'T00:00:00+09:00' 으로 KST 자정 인스턴트를 명시.
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** Date를 KST 일자 ISO('YYYY-MM-DD') 문자열로. AT TIME ZONE 결과(date 타입)와 형식 일치. */
export function isoDateKst(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * 크롤러가 채워둔 jobplanet URL이 응답에 새어 나가도 안전한지 검증.
 * https + jobplanet.co.kr 도메인만 통과. companies.service.ts의 동일 정책과 일치.
 */
export function safeJobplanetUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!/(^|\.)jobplanet\.co\.kr$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isJobSource(s: string): s is JobSource {
  return (
    s === 'gamejob' ||
    s === 'wanted' ||
    s === 'jobkorea' ||
    s === 'saramin' ||
    s === 'incruit'
  );
}

/**
 * 만료 여부. expiredAt 컬럼이 설정돼 있으면 즉시 true. 그게 null이어도
 * lastSeenAt이 EXPIRY_WINDOW_MS를 넘기면 true(만료 sweep 사이의 dynamic 분류).
 */
export function computeExpired(
  expiredAt: Date | null,
  lastSeenAt: Date | null,
): boolean {
  if (expiredAt) return true;
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() > EXPIRY_WINDOW_MS;
}

function asExperience(v: string | null | undefined): ExperienceLevel | null {
  if (v === 'newcomer' || v === 'junior' || v === 'mid' || v === 'senior' || v === 'any') {
    return v;
  }
  return null;
}

function asEmployment(v: string | null | undefined): EmploymentType | null {
  if (
    v === 'fulltime' ||
    v === 'contract' ||
    v === 'parttime' ||
    v === 'freelance' ||
    v === 'intern'
  ) {
    return v;
  }
  return null;
}

/**
 * Prisma row → @bini/types의 Job 응답 DTO 변환.
 * alternateSources는 dedup primary가 흡수한 별칭들, jobplanet은 회사명으로 합성한 평판 요약.
 * 둘 다 caller가 별도 쿼리로 모은 다음에 인자로 전달한다.
 */
export function toJobDto(
  row: {
    id: string;
    source: string;
    company: string;
    companyUrl: string;
    title: string;
    detailUrl: string;
    deadline: string;
    deadlineAt?: Date | null;
    registeredAt: Date;
    tags: string[];
    gameTitle: string | null;
    imageQuery: string;
    imageQueryType: string;
    companyLogoUrl: string | null;
    companyPhotos: string[];
    representativeGames: string[];
    lastSeenAt?: Date | null;
    expiredAt?: Date | null;
    experienceLevel?: string | null;
    employmentType?: string | null;
    locations?: string[];
    isRemote?: boolean;
  },
  alternateSources: Job['alternateSources'] = [],
  jobplanet: JobplanetSummary | null = null,
  thumbnailUrl: string | null = null,
): Job {
  const imageQueryType: Job['imageQueryType'] =
    row.imageQueryType === 'game' ? 'game' : 'company';
  const source: JobSource = isJobSource(row.source) ? row.source : 'gamejob';
  return {
    id: row.id,
    source,
    company: row.company,
    companyUrl: row.companyUrl,
    title: row.title,
    detailUrl: row.detailUrl,
    deadline: row.deadline,
    deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
    registeredAt: row.registeredAt.toISOString(),
    tags: row.tags,
    gameTitle: row.gameTitle,
    imageQuery: row.imageQuery,
    imageQueryType,
    alternateSources,
    companyLogoUrl: row.companyLogoUrl,
    companyPhotos: row.companyPhotos,
    representativeGames: row.representativeGames,
    expired: computeExpired(row.expiredAt ?? null, row.lastSeenAt ?? null),
    experienceLevel: asExperience(row.experienceLevel ?? null),
    employmentType: asEmployment(row.employmentType ?? null),
    locations: row.locations ?? [],
    isRemote: row.isRemote ?? false,
    jobplanet,
    thumbnailUrl,
  };
}
