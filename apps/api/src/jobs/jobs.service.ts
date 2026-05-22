import { Injectable } from '@nestjs/common';
import type { Job, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';

@Injectable()
export class JobsService {
  constructor(
    private readonly scraper: GamejobScraperService,
    private readonly prisma: PrismaService,
  ) {}

  /** 지정 페이지를 실시간 스크래핑 → DB upsert → DB에서 등록일순 반환. */
  async getJobsPage(page: number): Promise<JobsResponse> {
    const { jobs: rawJobs, totalPages } = await this.scraper.fetchJobList(page);
    const now = new Date();

    for (const raw of rawJobs) {
      const parsed = parseTitle(raw.title, raw.company);
      const registeredAt = parseRelativeTime(raw.registeredAtText, now);
      const data = {
        company: raw.company,
        companyUrl: raw.companyUrl,
        title: raw.title,
        detailUrl: raw.detailUrl,
        deadline: raw.deadline,
        registeredAt,
        tags: raw.tags,
        gameTitle: parsed.gameTitle,
        imageQuery: parsed.imageQuery,
        imageQueryType: parsed.imageQueryType,
      };
      await this.prisma.job.upsert({
        where: { id: raw.id },
        create: { id: raw.id, ...data },
        update: { ...data, lastSeenAt: now },
      });
    }

    const ids = rawJobs.map((r) => r.id);
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      orderBy: { registeredAt: 'desc' },
    });

    return { page, totalPages, jobs: rows.map(toJobDto) };
  }
}

function toJobDto(row: {
  id: string; company: string; companyUrl: string; title: string;
  detailUrl: string; deadline: string; registeredAt: Date; tags: string[];
  gameTitle: string | null; imageQuery: string; imageQueryType: string;
}): Job {
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
    imageQueryType: row.imageQueryType as Job['imageQueryType'],
  };
}
