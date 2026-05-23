import { Injectable, Logger } from '@nestjs/common';
import type { Job, JobSource, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { JobkoreaScraperService } from '../scraper/jobkorea-scraper.service';
import { SaraminScraperService } from '../scraper/saramin-scraper.service';
import { IncruitScraperService } from '../scraper/incruit-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';
import type { JobScraper } from '../scraper/scraper.interface';
import type { RawJob } from '../scraper/raw-job';
import { dedupeJobs } from './dedupe';

/** lastSeenAt이 이 값을 넘은 잡은 expired로 간주 (sweepExpired 임계값 + computeExpired 동적 계산 기준). */
const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PER_PAGE = 50;

/**
 * cron 호출자에게 반환하는 메타. early-stop 알고리즘이 newCount/dedupedCount 비율을
 * 임계값과 비교해 다음 페이지 진행 여부를 결정한다.
 */
export interface ScrapeResult {
  /** dedup 전 raw 잡 개수 */
  scrapedCount: number;
  /** dedup 후 처리된 고유 잡 개수 */
  dedupedCount: number;
  /** dedup 후 DB에 없던 신규 잡 개수 */
  newCount: number;
  /** 성공한 소스 중 최대 totalPages */
  totalPages: number;
  /** 부분 실패한 소스들 */
  failedSources: JobSource[];
  /** 모든 소스가 실패해서 이 페이지 결과가 비어 있는 상태 — cron이 즉시 중단해야 함 */
  totalFailure: boolean;
}

/**
 * 사용자 요청 경로(JobsService.getJobsPage)와 cron 경로를 분리하기 위해 도입된 서비스.
 * - 사용자 요청: getJobsFromDb — DB만 조회. Vercel 함수 timeout 안전.
 * - cron(GitHub Actions): scrapeAndUpsert + sweepExpired — 외부 스크래퍼 호출 포함.
 *
 * 기존 JobsService는 통합 테스트 호환을 위해 유지하되, 사용자 요청 경로의 Controller는
 * 이 서비스의 getJobsFromDb를 호출하도록 전환한다.
 */
@Injectable()
export class JobsCronService {
  private readonly logger = new Logger(JobsCronService.name);
  private readonly scrapers: JobScraper[];

  constructor(
    gamejob: GamejobScraperService,
    wanted: WantedScraperService,
    jobkorea: JobkoreaScraperService,
    saramin: SaraminScraperService,
    incruit: IncruitScraperService,
    private readonly prisma: PrismaService,
  ) {
    this.scrapers = [gamejob, wanted, jobkorea, saramin, incruit];
  }

  /**
   * cron 전용. 모든 스크래퍼를 병렬 호출 → dedup → DB upsert. 응답 합성은 안 한다.
   * 전체 실패해도 throw하지 않고 totalFailure=true로 반환 → cron이 다음 페이지 시도를 멈추도록.
   */
  async scrapeAndUpsert(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      this.scrapers.map((s) => s.fetchJobList(page)),
    );

    const failedSources: JobSource[] = [];
    const allRaw: RawJob[] = [];
    let maxTotalPages = 0;

    settled.forEach((r, i) => {
      const src = this.scrapers[i].source;
      if (r.status === 'fulfilled') {
        allRaw.push(...r.value.jobs);
        maxTotalPages = Math.max(maxTotalPages, r.value.totalPages);
      } else {
        this.logger.warn(`${src} fetch 실패: ${String(r.reason)}`);
        failedSources.push(src);
      }
    });

    if (failedSources.length === this.scrapers.length) {
      this.logger.error(`모든 소스 스크래핑 실패: ${failedSources.join(', ')}`);
      return {
        scrapedCount: 0,
        dedupedCount: 0,
        newCount: 0,
        totalPages: 0,
        failedSources,
        totalFailure: true,
      };
    }

    const deduped = dedupeJobs(allRaw);
    const ids = deduped.map((d) => `${d.source}:${d.sourceId}`);

    // newCount 산정 — Prisma upsert는 created/updated 구분을 반환하지 않으므로
    // upsert 전에 select 한 번으로 신규 비율을 계산한다 (early-stop 입력).
    let newCount = 0;
    if (ids.length > 0) {
      const existing = await this.prisma.job.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingSet = new Set(existing.map((e) => e.id));
      newCount = ids.filter((id) => !existingSet.has(id)).length;
    }

    const now = new Date();
    const upserts = deduped.map((raw) => {
      const parsed = parseTitle(raw.title, raw.company);
      const registeredAt = parseRelativeTime(raw.registeredAtText, now);
      const id = `${raw.source}:${raw.sourceId}`;
      // registeredAt은 create에만 둔다 — 재스크래핑 시 상대시간 재계산값으로
      // 최초 등록시각을 덮어쓰면 정렬이 흔들리기 때문.
      const common = {
        source: raw.source,
        sourceId: raw.sourceId,
        company: raw.company,
        companyUrl: raw.companyUrl,
        title: raw.title,
        detailUrl: raw.detailUrl,
        deadline: raw.deadline,
        tags: raw.tags,
        gameTitle: parsed.gameTitle,
        imageQuery: parsed.imageQuery,
        imageQueryType: parsed.imageQueryType,
      };
      return this.prisma.job.upsert({
        where: { id },
        create: { id, ...common, registeredAt },
        update: { ...common, lastSeenAt: now, expiredAt: null },
      });
    });

    if (upserts.length > 0) {
      await this.prisma.$transaction(upserts);
    }

    this.logger.log(
      `page ${page}: ${allRaw.length}건 raw → ${deduped.length}건 dedup → ${newCount}건 신규` +
        (failedSources.length ? ` (failed: ${failedSources.join(',')})` : ''),
    );

    return {
      scrapedCount: allRaw.length,
      dedupedCount: deduped.length,
      newCount,
      totalPages: maxTotalPages,
      failedSources,
      totalFailure: false,
    };
  }

  /**
   * 사용자 응답 경로. DB만 조회한다 — 외부 스크래퍼 호출 없음.
   * expired 잡도 결과에 포함하되 expired:true 플래그로 노출(프론트가 회색 처리 결정).
   * alternateSources는 dedup 시점 메모리에서만 합성되는 정보라 빈 배열로 둔다.
   * search가 주어지면 title/company의 부분 일치(대소문자 무시)로 필터링한다.
   */
  async getJobsFromDb(
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
    search?: string,
  ): Promise<JobsResponse> {
    const q = (search ?? '').trim();
    const where = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { company: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const skip = (page - 1) * perPage;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
        skip,
        take: perPage,
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const jobs = rows.map((row) => toJobDto(row));
    return { page, totalPages, jobs };
  }

  /**
   * lastSeenAt이 thresholdMs를 넘긴(또한 expiredAt이 아직 null인) 잡에 expiredAt을 채운다.
   * 응답상 expired는 computeExpired가 lastSeenAt 기반으로도 동적으로 true를 내지만,
   * 컬럼에 명시적으로 기록해두면 인덱스 활용·향후 정책 변경에 유리하다.
   */
  async sweepExpired(thresholdMs: number = EXPIRY_WINDOW_MS): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const result = await this.prisma.job.updateMany({
      where: { lastSeenAt: { lt: cutoff }, expiredAt: null },
      data: { expiredAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`sweepExpired: ${result.count}건 마킹`);
    }
    return result.count;
  }
}

function isJobSource(s: string): s is JobSource {
  return (
    s === 'gamejob' ||
    s === 'wanted' ||
    s === 'jobkorea' ||
    s === 'saramin' ||
    s === 'incruit'
  );
}

function computeExpired(
  expiredAt: Date | null,
  lastSeenAt: Date | null,
): boolean {
  if (expiredAt) return true;
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() > EXPIRY_WINDOW_MS;
}

function toJobDto(row: {
  id: string;
  source: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
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
}): Job {
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
    registeredAt: row.registeredAt.toISOString(),
    tags: row.tags,
    gameTitle: row.gameTitle,
    imageQuery: row.imageQuery,
    imageQueryType,
    alternateSources: [],
    companyLogoUrl: row.companyLogoUrl,
    companyPhotos: row.companyPhotos,
    representativeGames: row.representativeGames,
    expired: computeExpired(row.expiredAt ?? null, row.lastSeenAt ?? null),
  };
}
