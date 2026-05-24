import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsService.getStats', () => {
  function build(overrides: Partial<{
    bySource: Array<{ source: string; _count: { _all: number } }>;
    expiredCount: number;
    totalCount: number;
    newLast24h: number;
    lastCronRow: { lastSeenAt: Date } | null;
    enrichedCount: number;
  }> = {}) {
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

    // PrismaService에 호출되는 메서드 stub — 결과는 $transaction이 일괄 반환
    const job = {
      groupBy: jest.fn().mockReturnValue('groupByCall'),
      count: jest.fn().mockReturnValue('countCall'),
      findFirst: jest.fn().mockReturnValue('findFirstCall'),
    };
    const $transaction = jest
      .fn()
      .mockResolvedValue([bySource, expiredCount, totalCount, newLast24h, lastCronRow, enrichedCount]);
    const prisma = { job, $transaction } as unknown as PrismaService;
    return { service: new StatsService(prisma), $transaction };
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
    // unknown_source는 어떤 키에도 누적되지 않음
    expect(stats.bySource).toEqual({
      gamejob: 40,
      wanted: 0,
      jobkorea: 0,
      saramin: 0,
      incruit: 0,
    });
  });
});
