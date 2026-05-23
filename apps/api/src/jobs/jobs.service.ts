import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { Job, JobSource, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { JobkoreaScraperService } from '../scraper/jobkorea-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';
import type { JobScraper } from '../scraper/scraper.interface';
import type { RawJob } from '../scraper/raw-job';
import { dedupeJobs, type DedupedJob } from './dedupe';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly scrapers: JobScraper[];

  constructor(
    gamejob: GamejobScraperService,
    wanted: WantedScraperService,
    jobkorea: JobkoreaScraperService,
    private readonly prisma: PrismaService,
  ) {
    this.scrapers = [gamejob, wanted, jobkorea];
  }

  /**
   * 등록된 모든 스크래퍼를 병렬 호출 → dedup → 단일 트랜잭션 upsert → 등록일순 반환.
   * 일부 소스 실패는 failedSources 메타로 노출(부분 성공 허용),
   * 전체 실패만 BadGateway로 fail-loud.
   */
  async getJobsPage(page: number): Promise<JobsResponse> {
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
      throw new BadGatewayException(
        `모든 소스 스크래핑 실패: ${failedSources.join(', ')}`,
      );
    }

    const deduped = dedupeJobs(allRaw);
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
        update: { ...common, lastSeenAt: now },
      });
    });

    if (upserts.length > 0) {
      await this.prisma.$transaction(upserts);
    }
    this.logger.log(
      `page ${page}: ${allRaw.length}건 raw → ${deduped.length}건 dedup → upsert 완료` +
        (failedSources.length ? ` (failed: ${failedSources.join(',')})` : ''),
    );

    const ids = deduped.map((d) => `${d.source}:${d.sourceId}`);
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
    });

    // alternateSources를 sourceId 매칭으로 다시 attach (DB에는 저장 안 함, 응답 시점에 합성)
    const altMap = new Map<string, DedupedJob['alternateSources']>();
    for (const d of deduped) {
      altMap.set(`${d.source}:${d.sourceId}`, d.alternateSources);
    }

    const jobs = rows.map((row) =>
      toJobDto(row, altMap.get(row.id) ?? []),
    );

    const response: JobsResponse = { page, totalPages: maxTotalPages, jobs };
    if (failedSources.length > 0) response.failedSources = failedSources;
    return response;
  }
}

function isJobSource(s: string): s is JobSource {
  return (
    s === 'gamejob' ||
    s === 'wanted' ||
    s === 'jobkorea' ||
    s === 'saramin'
  );
}

const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toJobDto(
  row: {
    id: string; source: string; company: string; companyUrl: string;
    title: string; detailUrl: string; deadline: string; registeredAt: Date;
    tags: string[]; gameTitle: string | null; imageQuery: string;
    imageQueryType: string;
    companyLogoUrl: string | null; companyPhotos: string[]; representativeGames: string[];
    lastSeenAt?: Date | null; expiredAt?: Date | null;
  },
  alternateSources: DedupedJob['alternateSources'],
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
  };
}

function computeExpired(
  expiredAt: Date | null,
  lastSeenAt: Date | null,
): boolean {
  if (expiredAt) return true;
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() > EXPIRY_WINDOW_MS;
}
