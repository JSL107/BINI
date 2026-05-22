import { Injectable, Logger } from '@nestjs/common';
import type { Job, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly scraper: GamejobScraperService,
    private readonly prisma: PrismaService,
  ) {}

  /** 지정 페이지를 실시간 스크래핑 → DB에 단일 트랜잭션으로 upsert → 등록일순 반환. */
  async getJobsPage(page: number): Promise<JobsResponse> {
    const { jobs: rawJobs, totalPages } = await this.scraper.fetchJobList(page);
    const now = new Date();

    const upserts = rawJobs.map((raw) => {
      const parsed = parseTitle(raw.title, raw.company);
      const registeredAt = parseRelativeTime(raw.registeredAtText, now);
      // registeredAt은 create에만 둔다 — 재스크래핑 시 상대시간 재계산값으로
      // 최초 등록시각을 덮어쓰면 정렬이 흔들리고, 미해석 시 epoch로 가라앉는다.
      const common = {
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
        where: { id: raw.id },
        create: { id: raw.id, ...common, registeredAt },
        update: { ...common, lastSeenAt: now },
      });
    });

    if (upserts.length > 0) {
      // 단일 트랜잭션 — 원자성(부분 커밋 방지) + 라운드트립 일괄 처리.
      await this.prisma.$transaction(upserts);
    }
    this.logger.log(`page ${page}: ${rawJobs.length}건 스크래핑·upsert 완료`);

    const ids = rawJobs.map((r) => r.id);
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      // 같은 registeredAt 동률 시 안정 정렬을 위해 id를 보조 키로 사용.
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
    });

    return { page, totalPages, jobs: rows.map(toJobDto) };
  }
}

function toJobDto(row: {
  id: string; company: string; companyUrl: string; title: string;
  detailUrl: string; deadline: string; registeredAt: Date; tags: string[];
  gameTitle: string | null; imageQuery: string; imageQueryType: string;
}): Job {
  // imageQueryType은 DB에 free-form String으로 저장되므로 런타임 가드.
  const imageQueryType: Job['imageQueryType'] =
    row.imageQueryType === 'game' ? 'game' : 'company';
  return {
    id: row.id,
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
  };
}
