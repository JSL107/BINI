import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource, JobsResponse } from '@bini/types';
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
import { dedupeJobs, type DedupedJob } from './dedupe';
import { computeAttributes } from './job-attributes';
import { toJobDto } from './jobs-cron.service';

/**
 * @deprecated 사용자 응답 경로는 JobsCronService.getJobsFromDb를 사용한다.
 * 이 서비스의 getJobsPage는 컨트롤러에서 더 이상 호출되지 않으며, 통합 테스트 호환을 위해서만 유지된다.
 *
 * 주의: 이 메서드는 alias/primary 영속화를 수행하지 않는다. dedup은 메모리에서만 합성되고
 * `primaryJobId` 컬럼은 건드리지 않는다 (기존 값 보존). 운영용으로는 절대 호출하지 말 것.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
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
   * @deprecated 사용자 응답 경로가 아님 — JobsCronService.getJobsFromDb를 사용할 것.
   *
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
      const attrs = computeAttributes(raw.tags, raw.title);
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
        normalizedKey: raw.normalizedKey,
        experienceLevel: attrs.experienceLevel,
        employmentType: attrs.employmentType,
        locations: attrs.locations,
        isRemote: attrs.isRemote,
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

    const jobs = rows.map((row) => toJobDto(row, altMap.get(row.id) ?? []));

    const response: JobsResponse = { page, totalPages: maxTotalPages, jobs };
    if (failedSources.length > 0) response.failedSources = failedSources;
    return response;
  }
}
