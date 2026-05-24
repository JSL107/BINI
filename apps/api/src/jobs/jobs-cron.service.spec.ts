import { JobsCronService } from './jobs-cron.service';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { JobkoreaScraperService } from '../scraper/jobkorea-scraper.service';
import { SaraminScraperService } from '../scraper/saramin-scraper.service';
import { IncruitScraperService } from '../scraper/incruit-scraper.service';
import { PrismaService } from '../prisma/prisma.service';

interface JobRow {
  id: string;
  sourceId: string;
  source: string;
  expiredAt: Date | null;
  detailScrapedAt: Date | null;
  registeredAt: Date;
}

function build(seed: JobRow[]) {
  const findMany = jest.fn(
    async (args: {
      where: {
        source: string;
        expiredAt: null;
        OR: Array<{ detailScrapedAt: null } | { detailScrapedAt: { lt: Date } }>;
      };
      take: number;
    }) => {
      const cutoff = (args.where.OR.find((c) => 'detailScrapedAt' in c && c.detailScrapedAt && 'lt' in c.detailScrapedAt) as { detailScrapedAt: { lt: Date } } | undefined)?.detailScrapedAt.lt;
      const candidates = seed.filter(
        (r) =>
          r.source === args.where.source &&
          r.expiredAt === null &&
          (r.detailScrapedAt === null ||
            (cutoff !== undefined && r.detailScrapedAt < cutoff)),
      );
      // 시뮬레이션 정렬: detailScrapedAt asc nulls first, registeredAt desc
      candidates.sort((a, b) => {
        if (a.detailScrapedAt === null && b.detailScrapedAt !== null) return -1;
        if (a.detailScrapedAt !== null && b.detailScrapedAt === null) return 1;
        if (a.detailScrapedAt && b.detailScrapedAt) {
          const d = a.detailScrapedAt.getTime() - b.detailScrapedAt.getTime();
          if (d !== 0) return d;
        }
        return b.registeredAt.getTime() - a.registeredAt.getTime();
      });
      return candidates.slice(0, args.take).map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
      }));
    },
  );
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    job: { findMany, update },
  } as unknown as PrismaService;
  const fetchDetail = jest.fn(async (_id: string) => ({
    companyLogoUrl: 'https://logo/x.jpg',
    companyPhotos: ['https://photo/a.jpg'],
    representativeGames: ['게임A'],
    bodyImages: ['https://body/x.jpg'],
  }));
  const detail = { fetchDetail } as unknown as GamejobDetailService;
  const stub = {} as unknown;
  const service = new JobsCronService(
    stub as GamejobScraperService,
    stub as WantedScraperService,
    stub as JobkoreaScraperService,
    stub as SaraminScraperService,
    stub as IncruitScraperService,
    prisma,
    detail,
  );
  return { service, findMany, update, fetchDetail };
}

describe('JobsCronService.rescrapeStaleDetails', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  it('detailScrapedAt null 잡과 1일 넘은 잡을 대상에 포함, 만료/타 소스는 제외', async () => {
    const { service, fetchDetail, update } = build([
      // 대상: detail 없음
      { id: 'gamejob:1', sourceId: '1', source: 'gamejob', expiredAt: null, detailScrapedAt: null, registeredAt: new Date(now - 1000) },
      // 대상: 2일 전 detail
      { id: 'gamejob:2', sourceId: '2', source: 'gamejob', expiredAt: null, detailScrapedAt: new Date(now - 2 * day), registeredAt: new Date(now - 2000) },
      // 제외: 1시간 전 (stale 아님)
      { id: 'gamejob:3', sourceId: '3', source: 'gamejob', expiredAt: null, detailScrapedAt: new Date(now - 60 * 60 * 1000), registeredAt: new Date(now - 3000) },
      // 제외: 만료됨
      { id: 'gamejob:4', sourceId: '4', source: 'gamejob', expiredAt: new Date(), detailScrapedAt: null, registeredAt: new Date(now - 4000) },
      // 제외: 타 소스
      { id: 'wanted:5', sourceId: '5', source: 'wanted', expiredAt: null, detailScrapedAt: null, registeredAt: new Date(now - 5000) },
    ]);
    const r = await service.rescrapeStaleDetails({ sleepMs: 0 });
    expect(r.attempted).toBe(2);
    expect(r.updated).toBe(2);
    expect(r.failed).toBe(0);
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(2);
    // 첫 update가 정확한 데이터 형태로 호출
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: expect.any(String) },
      data: {
        companyLogoUrl: 'https://logo/x.jpg',
        companyPhotos: ['https://photo/a.jpg'],
        representativeGames: ['게임A'],
        bodyImages: ['https://body/x.jpg'],
        detailScrapedAt: expect.any(Date),
      },
    });
  });

  it('limit으로 잘려서 attempted가 limit 이하', async () => {
    const { service } = build(
      Array.from({ length: 10 }, (_, i) => ({
        id: `gamejob:${i}`,
        sourceId: `${i}`,
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - i * 1000),
      })),
    );
    const r = await service.rescrapeStaleDetails({ limit: 3, sleepMs: 0 });
    expect(r.attempted).toBe(3);
  });

  it('fetchDetail이 throw하면 failed로 기록하고 다음 잡 진행', async () => {
    const { service, update, fetchDetail } = build([
      { id: 'gamejob:1', sourceId: '1', source: 'gamejob', expiredAt: null, detailScrapedAt: null, registeredAt: new Date(now - 1000) },
      { id: 'gamejob:2', sourceId: '2', source: 'gamejob', expiredAt: null, detailScrapedAt: null, registeredAt: new Date(now - 2000) },
    ]);
    (fetchDetail as jest.Mock)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        companyLogoUrl: null,
        companyPhotos: [],
        representativeGames: [],
        bodyImages: [],
      });
    const r = await service.rescrapeStaleDetails({ sleepMs: 0 });
    expect(r.attempted).toBe(2);
    expect(r.updated).toBe(1);
    expect(r.failed).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('대상 0건이면 attempted=0 (fetchDetail 호출 없음)', async () => {
    const { service, fetchDetail } = build([]);
    const r = await service.rescrapeStaleDetails({ sleepMs: 0 });
    expect(r.attempted).toBe(0);
    expect(r.updated).toBe(0);
    expect(fetchDetail).not.toHaveBeenCalled();
  });
});
