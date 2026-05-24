import { Injectable, Logger } from '@nestjs/common';
import type { Job, JobSource, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { WantedDetailService } from '../scraper/wanted-detail.service';
import { JobkoreaScraperService } from '../scraper/jobkorea-scraper.service';
import { JobkoreaDetailService } from '../scraper/jobkorea-detail.service';
import { SaraminScraperService } from '../scraper/saramin-scraper.service';
import { IncruitScraperService } from '../scraper/incruit-scraper.service';
import { IncruitDetailService } from '../scraper/incruit-detail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JobDetailExtract } from '../scraper/gamejob-detail-parser';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';
import type { JobScraper } from '../scraper/scraper.interface';
import type { RawJob } from '../scraper/raw-job';
import { dedupeJobs } from './dedupe';

/** lastSeenAt이 이 값을 넘은 잡은 expired로 간주 (sweepExpired 임계값 + computeExpired 동적 계산 기준). */
const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PER_PAGE = 50;
/** detail 재스크래핑 stale 기준. detailScrapedAt이 이 값보다 오래된 잡 또는 null인 잡을 대상으로. */
const DEFAULT_DETAIL_STALE_MS = 24 * 60 * 60 * 1000;
/** 한 cron 사이클에서 detail 재스크래핑할 최대 잡 수 (게임잡 burst 보호 + 워크플로우 시간 캡). */
const DEFAULT_DETAIL_RESCRAPE_LIMIT = 100;
/** 잡당 detail fetch 사이 sleep — 게임잡에 burst를 만들지 않기 위한 정중함. */
const DETAIL_RESCRAPE_SLEEP_MS = 500;

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
/** detail fetcher 시그니처 — `JobDetailExtract`를 반환하는 source별 어댑터. */
interface JobDetailFetcher {
  fetchDetail(sourceId: string): Promise<JobDetailExtract>;
}

@Injectable()
export class JobsCronService {
  private readonly logger = new Logger(JobsCronService.name);
  private readonly scrapers: JobScraper[];
  /** detail 재스크래핑을 지원하는 source → fetcher 매핑. 새 source 추가 시 여기 등록. */
  private readonly detailFetchers: Record<string, JobDetailFetcher>;

  constructor(
    gamejob: GamejobScraperService,
    wanted: WantedScraperService,
    jobkorea: JobkoreaScraperService,
    saramin: SaraminScraperService,
    incruit: IncruitScraperService,
    private readonly prisma: PrismaService,
    private readonly gamejobDetail: GamejobDetailService,
    private readonly wantedDetail: WantedDetailService,
    private readonly jobkoreaDetail: JobkoreaDetailService,
    private readonly incruitDetail: IncruitDetailService,
  ) {
    this.scrapers = [gamejob, wanted, jobkorea, saramin, incruit];
    this.detailFetchers = {
      gamejob: this.gamejobDetail,
      wanted: this.wantedDetail,
      jobkorea: this.jobkoreaDetail,
      incruit: this.incruitDetail,
    };
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
      // 페이지당 dedup된 잡 수십~수백 건 × upsert. Prisma 기본 5초 timeout으로는
      // Neon serverless cold-start까지 끼면 부족하다. 30초로 여유 부여.
      await this.prisma.$transaction(upserts, { timeout: 30_000 });
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

  /**
   * 상세 페이지를 재스크래핑해서 회사 로고·사진·대표게임·본문 키아트를 갱신.
   * 현재 지원 source: gamejob (본문 iframe) + wanted (api/v4/jobs/<id>).
   *
   * 대상:
   *   - `source IN detailFetchers` AND `expiredAt IS NULL` (만료 잡은 갱신 무의미)
   *   - `detailScrapedAt IS NULL` (lazy enrichment를 트리거할 사용자 클릭이 없었던 잡)
   *     OR `detailScrapedAt < now - staleAgeMs`
   *
   * 정렬:
   *   - `detailScrapedAt asc nulls first` — 가장 오래된(또는 한 번도 안 본) 것부터.
   *   - 동순위 시 `registeredAt desc` — 최신 잡 우선.
   *
   * 한 cron 사이클당 limit으로 캡 — 외부 사이트에 burst를 만들지 않고, 워크플로우
   * 시간(30분)도 안전하게 지킨다. 잡당 fetchDetail은 8s timeout + 500ms sleep.
   * 100건이면 최악 13분, 평균 2-3분.
   */
  async rescrapeStaleDetails(opts?: {
    limit?: number;
    staleAgeMs?: number;
    /** 잡당 sleep — 외부 사이트 burst 방어. 단위 테스트에선 0으로 전달. */
    sleepMs?: number;
  }): Promise<{ attempted: number; updated: number; failed: number }> {
    const limit = opts?.limit ?? DEFAULT_DETAIL_RESCRAPE_LIMIT;
    const staleAgeMs = opts?.staleAgeMs ?? DEFAULT_DETAIL_STALE_MS;
    const sleepMs = opts?.sleepMs ?? DETAIL_RESCRAPE_SLEEP_MS;
    const cutoff = new Date(Date.now() - staleAgeMs);
    const supportedSources = Object.keys(this.detailFetchers);

    const targets = await this.prisma.job.findMany({
      where: {
        source: { in: supportedSources },
        expiredAt: null,
        OR: [{ detailScrapedAt: null }, { detailScrapedAt: { lt: cutoff } }],
      },
      orderBy: [{ detailScrapedAt: 'asc' }, { registeredAt: 'desc' }],
      take: limit,
      select: { id: true, sourceId: true, source: true },
    });

    let updated = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const job = targets[i];
      const fetcher = this.detailFetchers[job.source];
      if (!fetcher) {
        // source 매핑이 사라진 경우 — 안전상 skip (where 절이 이미 걸렀어야 함).
        continue;
      }
      try {
        const detail = await fetcher.fetchDetail(job.sourceId || job.id);
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            companyLogoUrl: detail.companyLogoUrl,
            companyPhotos: detail.companyPhotos,
            representativeGames: detail.representativeGames,
            bodyImages: detail.bodyImages,
            detailScrapedAt: new Date(),
          },
        });
        updated++;
      } catch (err) {
        failed++;
        this.logger.warn(`rescrape ${job.id} 실패: ${String(err).slice(0, 140)}`);
      }
      if (i + 1 < targets.length && sleepMs > 0) {
        await new Promise((r) => setTimeout(r, sleepMs));
      }
    }

    this.logger.log(
      `rescrapeStaleDetails: attempted=${targets.length} updated=${updated} failed=${failed}`,
    );
    return { attempted: targets.length, updated, failed };
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
