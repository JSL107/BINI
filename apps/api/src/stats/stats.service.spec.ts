import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsService.getStats', () => {
  function build(
    overrides: Partial<{
      bySource: Array<{ source: string; _count: { _all: number } }>;
      expiredCount: number;
      totalCount: number;
      newLast24h: number;
      lastCronRow: { lastSeenAt: Date } | null;
      enrichedCount: number;
      activeBySource: Array<{ source: string; _count: { _all: number } }>;
      topCompanies: Array<{ company: string; _count: { _all: number } }>;
      weeklyTrendRows: Array<{ week_start: Date; count: bigint | number }>;
      cronRuns: Array<Record<string, unknown>>;
    }> = {},
  ) {
    const bySource = overrides.bySource ?? [
      { source: 'gamejob', _count: { _all: 40 } },
      { source: 'jobkorea', _count: { _all: 11 } },
    ];
    const expiredCount = overrides.expiredCount ?? 5;
    const totalCount = overrides.totalCount ?? 60;
    const newLast24h = overrides.newLast24h ?? 7;
    const enrichedCount = overrides.enrichedCount ?? 30;
    const lastCronRow =
      'lastCronRow' in overrides
        ? overrides.lastCronRow
        : { lastSeenAt: new Date('2026-05-23T10:00:00Z') };
    const activeBySource = overrides.activeBySource ?? [
      { source: 'gamejob', _count: { _all: 35 } },
    ];
    const topCompanies = overrides.topCompanies ?? [
      { company: 'GameCo', _count: { _all: 12 } },
      { company: 'StudioX', _count: { _all: 8 } },
    ];
    const weeklyTrendRows = overrides.weeklyTrendRows ?? [
      { week_start: new Date('2026-05-18T00:00:00Z'), count: 7n },
      { week_start: new Date('2026-05-11T00:00:00Z'), count: 3n },
    ];
    const cronRuns = overrides.cronRuns ?? [];

    const job = {
      groupBy: jest.fn().mockReturnValue('groupByCall'),
      count: jest.fn().mockReturnValue('countCall'),
      findFirst: jest.fn().mockReturnValue('findFirstCall'),
    };
    const cronRun = {
      findMany: jest.fn().mockReturnValue('cronRunFindMany'),
    };
    const $transaction = jest
      .fn()
      .mockResolvedValue([
        bySource,
        expiredCount,
        totalCount,
        newLast24h,
        lastCronRow,
        enrichedCount,
        activeBySource,
        topCompanies,
        cronRuns,
      ]);
    const $queryRaw = jest.fn().mockResolvedValue(weeklyTrendRows);
    const prisma = { job, cronRun, $transaction, $queryRaw } as unknown as PrismaService;
    return { service: new StatsService(prisma), $transaction, $queryRaw };
  }

  it('소스별 카운트를 5개 키 모두로 정규화한다 (없는 소스는 0)', async () => {
    const { service } = build({
      bySource: [
        { source: 'gamejob', _count: { _all: 40 } },
        { source: 'wanted', _count: { _all: 1 } },
      ],
    });
    const stats = await service.getStats();
    expect(stats.bySource).toEqual({
      gamejob: 40,
      wanted: 1,
      jobkorea: 0,
      saramin: 0,
      incruit: 0,
    });
  });

  it('active = total - expired', async () => {
    const { service } = build({ totalCount: 100, expiredCount: 17 });
    const stats = await service.getStats();
    expect(stats.active).toBe(83);
    expect(stats.expired).toBe(17);
  });

  it('total=0일 때 enrichedRatio는 0이다', async () => {
    const { service } = build({ totalCount: 0, enrichedCount: 0 });
    const stats = await service.getStats();
    expect(stats.enrichedRatio).toBe(0);
  });

  it('enrichedRatio는 enrichedCount/total', async () => {
    const { service } = build({ totalCount: 100, enrichedCount: 30 });
    const stats = await service.getStats();
    expect(stats.enrichedRatio).toBeCloseTo(0.3, 5);
  });

  it('lastCronRow가 null이면 lastCronRunAt도 null', async () => {
    const { service } = build({ lastCronRow: null });
    const stats = await service.getStats();
    expect(stats.lastCronRunAt).toBeNull();
  });

  it('lastCronRunAt은 ISO 문자열로 반환', async () => {
    const { service } = build({ lastCronRow: { lastSeenAt: new Date('2026-05-23T10:00:00Z') } });
    const stats = await service.getStats();
    expect(stats.lastCronRunAt).toBe('2026-05-23T10:00:00.000Z');
  });

  it('알 수 없는 source는 무시한다 (DB에 legacy 값이 있어도 5개 union 유지)', async () => {
    const { service } = build({
      bySource: [
        { source: 'gamejob', _count: { _all: 40 } },
        { source: 'unknown_source', _count: { _all: 99 } },
      ],
    });
    const stats = await service.getStats();
    expect(stats.bySource.gamejob).toBe(40);
    expect(stats.bySource).toEqual({
      gamejob: 40,
      wanted: 0,
      jobkorea: 0,
      saramin: 0,
      incruit: 0,
    });
  });

  it('activeBySource도 5개 키 정규화', async () => {
    const { service } = build({
      activeBySource: [
        { source: 'gamejob', _count: { _all: 30 } },
        { source: 'wanted', _count: { _all: 2 } },
      ],
    });
    const stats = await service.getStats();
    expect(stats.activeBySource).toEqual({
      gamejob: 30,
      wanted: 2,
      jobkorea: 0,
      saramin: 0,
      incruit: 0,
    });
  });

  it('topCompanies는 company/count 매핑 + 입력 순서 보존', async () => {
    const { service } = build({
      topCompanies: [
        { company: 'A', _count: { _all: 9 } },
        { company: 'B', _count: { _all: 4 } },
      ],
    });
    const stats = await service.getStats();
    expect(stats.topCompanies).toEqual([
      { company: 'A', count: 9 },
      { company: 'B', count: 4 },
    ]);
  });

  it('weeklyTrend는 weekStart(YYYY-MM-DD) + 숫자 count', async () => {
    const { service } = build({
      weeklyTrendRows: [
        { week_start: new Date('2026-05-18T00:00:00Z'), count: 7n },
        { week_start: new Date('2026-05-11T00:00:00Z'), count: 3n },
      ],
    });
    const stats = await service.getStats();
    expect(stats.weeklyTrend).toEqual([
      { weekStart: '2026-05-18', count: 7 },
      { weekStart: '2026-05-11', count: 3 },
    ]);
  });

  it('weeklyTrend가 비어 있어도 빈 배열로 반환', async () => {
    const { service } = build({ weeklyTrendRows: [] });
    const stats = await service.getStats();
    expect(stats.weeklyTrend).toEqual([]);
  });

  it('recentCronRuns는 ledger 행을 ISO/숫자로 매핑하고 입력 순서 보존', async () => {
    const startedAt = new Date('2026-05-26T01:00:00Z');
    const finishedAt = new Date('2026-05-26T01:00:43Z');
    const { service } = build({
      cronRuns: [
        {
          id: 'run-1',
          startedAt,
          finishedAt,
          status: 'success',
          pagesProcessed: 5,
          scrapedTotal: 100,
          dedupedTotal: 80,
          newTotal: 12,
          expiredSwept: 3,
          detailRescrapeAttempted: 100,
          detailRescrapeUpdated: 95,
          detailRescrapeFailed: 5,
          failedSources: [],
          errorMessage: null,
          durationMs: 43000,
        },
      ],
    });
    const stats = await service.getStats();
    expect(stats.recentCronRuns).toEqual([
      {
        id: 'run-1',
        startedAt: '2026-05-26T01:00:00.000Z',
        finishedAt: '2026-05-26T01:00:43.000Z',
        status: 'success',
        pagesProcessed: 5,
        scrapedTotal: 100,
        dedupedTotal: 80,
        newTotal: 12,
        expiredSwept: 3,
        detailRescrapeAttempted: 100,
        detailRescrapeUpdated: 95,
        detailRescrapeFailed: 5,
        failedSources: [],
        errorMessage: null,
        durationMs: 43000,
      },
    ]);
  });

  it('알 수 없는 cron status는 "crashed"로 폴백 (이상 상태 노출)', async () => {
    const { service } = build({
      cronRuns: [
        {
          id: 'x',
          startedAt: new Date('2026-05-26T01:00:00Z'),
          finishedAt: null,
          status: 'mystery',
          pagesProcessed: 0,
          scrapedTotal: 0,
          dedupedTotal: 0,
          newTotal: 0,
          expiredSwept: 0,
          detailRescrapeAttempted: 0,
          detailRescrapeUpdated: 0,
          detailRescrapeFailed: 0,
          failedSources: [],
          errorMessage: null,
          durationMs: null,
        },
      ],
    });
    const stats = await service.getStats();
    expect(stats.recentCronRuns[0].status).toBe('crashed');
  });

  it('cronRuns가 비어 있어도 빈 배열로 반환', async () => {
    const { service } = build({ cronRuns: [] });
    const stats = await service.getStats();
    expect(stats.recentCronRuns).toEqual([]);
  });
});
