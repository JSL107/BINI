import { Injectable } from '@nestjs/common';
import type { JobSource, StatsResponse } from '@bini/types';
import { PrismaService } from '../prisma/prisma.service';

const ALL_SOURCES: JobSource[] = ['gamejob', 'wanted', 'jobkorea', 'saramin', 'incruit'];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<StatsResponse> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 단일 트랜잭션으로 한 라운드트립에 통계 집계 (DB 단의 일관성 보장).
    const [bySource, expiredCount, totalCount, newLast24h, lastCronRow, enrichedCount] =
      await this.prisma.$transaction([
        this.prisma.job.groupBy({
          by: ['source'],
          _count: { _all: true },
          orderBy: { source: 'asc' },
        }),
        this.prisma.job.count({ where: { expiredAt: { not: null } } }),
        this.prisma.job.count(),
        this.prisma.job.count({ where: { firstSeenAt: { gte: dayAgo } } }),
        this.prisma.job.findFirst({
          orderBy: { lastSeenAt: 'desc' },
          select: { lastSeenAt: true },
        }),
        this.prisma.job.count({ where: { detailScrapedAt: { not: null } } }),
      ]);

    const counts: Record<JobSource, number> = {
      gamejob: 0,
      wanted: 0,
      jobkorea: 0,
      saramin: 0,
      incruit: 0,
    };
    for (const row of bySource as Array<{ source: string; _count: { _all: number } }>) {
      if ((ALL_SOURCES as readonly string[]).includes(row.source)) {
        counts[row.source as JobSource] = row._count._all;
      }
    }

    return {
      total: totalCount,
      active: totalCount - expiredCount,
      expired: expiredCount,
      newLast24h,
      enrichedCount,
      enrichedRatio: totalCount > 0 ? enrichedCount / totalCount : 0,
      bySource: counts,
      lastCronRunAt: lastCronRow?.lastSeenAt?.toISOString() ?? null,
      generatedAt: now.toISOString(),
    };
  }
}
