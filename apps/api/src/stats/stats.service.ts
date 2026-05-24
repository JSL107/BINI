import { Injectable } from '@nestjs/common';
import type {
  CompanyCount,
  JobSource,
  StatsResponse,
  WeeklyTrendPoint,
} from '@bini/types';
import { PrismaService } from '../prisma/prisma.service';

const ALL_SOURCES: JobSource[] = ['gamejob', 'wanted', 'jobkorea', 'saramin', 'incruit'];
const WEEKLY_TREND_WEEKS = 12;
const TOP_COMPANIES_LIMIT = 20;

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<StatsResponse> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 단일 트랜잭션으로 한 라운드트립에 통계 집계 (DB 단의 일관성 보장).
    const [
      bySource,
      expiredCount,
      totalCount,
      newLast24h,
      lastCronRow,
      enrichedCount,
      activeBySourceRows,
      topCompaniesRows,
    ] = await this.prisma.$transaction([
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
      this.prisma.job.groupBy({
        by: ['source'],
        where: { primaryJobId: null, expiredAt: null },
        _count: { _all: true },
        orderBy: { source: 'asc' },
      }),
      this.prisma.job.groupBy({
        by: ['company'],
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: TOP_COMPANIES_LIMIT,
      }),
    ]);

    // weeklyTrend는 date_trunc + interval — Prisma groupBy로는 표현이 깔끔하지 않아 raw SQL.
    // 안전상 별도 await(통계 약간 stale OK). 결과 행이 12주 미만이어도 그대로 반환 — 차트가 빈 주를 채움.
    const weeklyTrend = await this.fetchWeeklyTrend();

    const counts = sourceCountsFrom(bySource);
    const activeBySource = sourceCountsFrom(activeBySourceRows);

    const topCompanies: CompanyCount[] = (
      topCompaniesRows as Array<{ company: string; _count: { _all: number } }>
    ).map((r) => ({ company: r.company, count: r._count._all }));

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
      weeklyTrend,
      topCompanies,
      activeBySource,
    };
  }

  /**
   * 최근 N주(기본 12주) 신규 공고 추세를 raw SQL로 산출.
   * `date_trunc('week', "firstSeenAt")`는 ISO 월요일 시작 주. 결과는 ASC.
   * INTERVAL 곱셈으로 N을 안전하게 파라미터화 — `int || text` cast 함정 회피.
   */
  private async fetchWeeklyTrend(): Promise<WeeklyTrendPoint[]> {
    type Row = { week_start: Date; count: bigint | number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('week', "firstSeenAt") AS week_start, COUNT(*) AS count
      FROM jobs
      WHERE "firstSeenAt" >= NOW() - (${WEEKLY_TREND_WEEKS}::int * INTERVAL '1 week')
      GROUP BY week_start
      ORDER BY week_start ASC
    `;
    return rows.map((r) => ({
      weekStart: weekStartIsoDate(r.week_start),
      count: Number(r.count),
    }));
  }
}

function weekStartIsoDate(d: Date): string {
  // Date를 ISO date(YYYY-MM-DD)로. date_trunc는 UTC 자정이라 toISOString의 앞 10자 사용.
  return d.toISOString().slice(0, 10);
}

function sourceCountsFrom(
  rows: Array<{ source: string; _count: { _all: number } }> | unknown,
): Record<JobSource, number> {
  const counts: Record<JobSource, number> = {
    gamejob: 0,
    wanted: 0,
    jobkorea: 0,
    saramin: 0,
    incruit: 0,
  };
  if (!Array.isArray(rows)) return counts;
  for (const row of rows as Array<{ source: string; _count: { _all: number } }>) {
    if ((ALL_SOURCES as readonly string[]).includes(row.source)) {
      counts[row.source as JobSource] = row._count._all;
    }
  }
  return counts;
}
