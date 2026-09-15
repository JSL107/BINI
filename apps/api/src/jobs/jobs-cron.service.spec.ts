import { JobsCronService } from './jobs-cron.service';
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
import type { RawJob } from '../scraper/raw-job';

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
        source: { in: string[] };
        expiredAt: null;
        OR: Array<
          { detailScrapedAt: null } | { detailScrapedAt: { lt: Date } }
        >;
      };
      take: number;
    }) => {
      const cutoff = (
        args.where.OR.find(
          (c) =>
            'detailScrapedAt' in c &&
            c.detailScrapedAt &&
            'lt' in c.detailScrapedAt,
        ) as { detailScrapedAt: { lt: Date } } | undefined
      )?.detailScrapedAt.lt;
      const supportedSources = new Set(args.where.source.in);
      const candidates = seed.filter(
        (r) =>
          supportedSources.has(r.source) &&
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
        source: r.source,
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
  const gamejobDetail = { fetchDetail } as unknown as GamejobDetailService;
  // wanted fetcher — 기본은 호출되어도 빈 결과. 일부 테스트에서 mockResolvedValueOnce로 override.
  const wantedFetchDetail = jest.fn(async (_id: string) => ({
    companyLogoUrl: null,
    companyPhotos: [],
    representativeGames: [],
    bodyImages: [],
  }));
  const wantedDetail = {
    fetchDetail: wantedFetchDetail,
  } as unknown as WantedDetailService;
  const emptyDetail = async (_id: string) => ({
    companyLogoUrl: null,
    companyPhotos: [],
    representativeGames: [],
    bodyImages: [],
  });
  const jobkoreaFetchDetail = jest.fn(emptyDetail);
  const jobkoreaDetail = {
    fetchDetail: jobkoreaFetchDetail,
  } as unknown as JobkoreaDetailService;
  const incruitFetchDetail = jest.fn(emptyDetail);
  const incruitDetail = {
    fetchDetail: incruitFetchDetail,
  } as unknown as IncruitDetailService;
  const stub = {} as unknown;
  const service = new JobsCronService(
    stub as GamejobScraperService,
    stub as WantedScraperService,
    stub as JobkoreaScraperService,
    stub as SaraminScraperService,
    stub as IncruitScraperService,
    prisma,
    gamejobDetail,
    wantedDetail,
    jobkoreaDetail,
    incruitDetail,
  );
  return {
    service,
    findMany,
    update,
    fetchDetail,
    wantedFetchDetail,
    jobkoreaFetchDetail,
    incruitFetchDetail,
  };
}

describe('JobsCronService.rescrapeStaleDetails', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  it('gamejob/wanted/jobkorea/incruit detail null/stale 잡 포함, 만료/unsupported(saramin) 제외', async () => {
    const {
      service,
      fetchDetail,
      wantedFetchDetail,
      jobkoreaFetchDetail,
      incruitFetchDetail,
      update,
    } = build([
      // 대상: gamejob, detail 없음
      {
        id: 'gamejob:1',
        sourceId: '1',
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 1000),
      },
      // 대상: gamejob, 2일 전 detail
      {
        id: 'gamejob:2',
        sourceId: '2',
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: new Date(now - 2 * day),
        registeredAt: new Date(now - 2000),
      },
      // 대상: wanted, detail 없음
      {
        id: 'wanted:9',
        sourceId: '9',
        source: 'wanted',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 1500),
      },
      // 대상: jobkorea, detail 없음 (이번에 새로 지원)
      {
        id: 'jobkorea:8',
        sourceId: '8',
        source: 'jobkorea',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 1300),
      },
      // 대상: incruit, detail 없음 (이번에 새로 지원)
      {
        id: 'incruit:7',
        sourceId: '7',
        source: 'incruit',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 1100),
      },
      // 제외: 1시간 전 (stale 아님)
      {
        id: 'gamejob:3',
        sourceId: '3',
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: new Date(now - 60 * 60 * 1000),
        registeredAt: new Date(now - 3000),
      },
      // 제외: 만료됨
      {
        id: 'gamejob:4',
        sourceId: '4',
        source: 'gamejob',
        expiredAt: new Date(),
        detailScrapedAt: null,
        registeredAt: new Date(now - 4000),
      },
      // 제외: detailFetchers에 없는 source (saramin은 JS 렌더링이라 아직 미지원)
      {
        id: 'saramin:5',
        sourceId: '5',
        source: 'saramin',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 5000),
      },
    ]);
    const r = await service.rescrapeStaleDetails({ sleepMs: 0 });
    expect(r.attempted).toBe(5);
    expect(r.updated).toBe(5);
    expect(r.failed).toBe(0);
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(wantedFetchDetail).toHaveBeenCalledTimes(1);
    expect(jobkoreaFetchDetail).toHaveBeenCalledTimes(1);
    expect(incruitFetchDetail).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(5);
    // gamejob update의 data 형태
    const gamejobUpdate = update.mock.calls.find((c) =>
      (c[0] as { where: { id: string } }).where.id.startsWith('gamejob:'),
    );
    expect(gamejobUpdate?.[0]).toMatchObject({
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
      {
        id: 'gamejob:1',
        sourceId: '1',
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 1000),
      },
      {
        id: 'gamejob:2',
        sourceId: '2',
        source: 'gamejob',
        expiredAt: null,
        detailScrapedAt: null,
        registeredAt: new Date(now - 2000),
      },
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

function rawJob(
  over: Partial<RawJob> & { sourceId: string; title: string },
): RawJob {
  return {
    source: 'gamejob',
    company: '테스트게임즈',
    companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
    detailUrl: `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${over.sourceId}`,
    deadline: '상시',
    registeredAtText: '1시간 전 등록',
    tags: ['경력무관', '서울 > 강남구', '정규직'],
    jobFamilies: ['원화'],
    ...over,
  };
}

function buildUpsertHarness(jobs: RawJob[]) {
  const upsert = jest.fn((args: unknown) => args);
  const prisma = {
    job: { findMany: jest.fn(async () => []), upsert },
    $transaction: jest.fn(async () => []),
  } as unknown as PrismaService;

  const scraper = {
    source: 'gamejob',
    fetchJobList: jest.fn(async () => ({ jobs, totalPages: 1 })),
  };
  const dead = {
    source: 'wanted',
    fetchJobList: jest.fn(async () => {
      throw new Error('not used');
    }),
  };
  const stub = {} as unknown;
  const service = new JobsCronService(
    scraper as unknown as GamejobScraperService,
    dead as unknown as WantedScraperService,
    dead as unknown as JobkoreaScraperService,
    dead as unknown as SaraminScraperService,
    dead as unknown as IncruitScraperService,
    prisma,
    stub as GamejobDetailService,
    stub as WantedDetailService,
    stub as JobkoreaDetailService,
    stub as IncruitDetailService,
  );
  return { service, upsert };
}

describe('JobsCronService.scrapeAndUpsert — 축 A 제외 + 축 B 태그', () => {
  it('제외 규칙에 걸린 공고는 upsert 하지 않는다', async () => {
    const { service, upsert } = buildUpsertHarness([
      rawJob({
        sourceId: '1',
        title: '[SBS아카데미게임학원] 평일 게임원화 강사 모집',
      }),
      rawJob({ sourceId: '2', title: '[청월당(로켓AI)] 웹툰 작가 채용' }),
      rawJob({
        sourceId: '3',
        title: '[위메이드커넥트] 배경 원화 담당자 모집',
      }),
    ]);

    await service.scrapeAndUpsert(1);

    const ids = upsert.mock.calls.map(
      (c) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(ids).toEqual(['gamejob:3']);
  });

  it('scrapedCount 는 제외 전 원시 수신량을 유지한다', async () => {
    const { service } = buildUpsertHarness([
      rawJob({
        sourceId: '1',
        title: '[SBS아카데미게임학원] 평일 게임원화 강사 모집',
      }),
      rawJob({
        sourceId: '3',
        title: '[위메이드커넥트] 배경 원화 담당자 모집',
      }),
    ]);

    const result = await service.scrapeAndUpsert(1);

    expect(result.scrapedCount).toBe(2);
    expect(result.dedupedCount).toBe(1);
  });

  it('직군과 원화 하위 구분을 함께 저장한다', async () => {
    const { service, upsert } = buildUpsertHarness([
      rawJob({
        sourceId: '10',
        title: '[신규 프로젝트] 캐릭터/배경 원화가',
        jobFamilies: ['원화', '이펙트·FX'],
      }),
      rawJob({
        sourceId: '11',
        title: '[크리티카] 3D 캐릭터 모델러 모집',
        jobFamilies: ['모델링'],
      }),
    ]);

    await service.scrapeAndUpsert(1);

    const byId = new Map(
      upsert.mock.calls.map((c) => {
        const a = c[0] as {
          where: { id: string };
          create: { jobFamilies: string[]; artSubtypes: string[] };
        };
        return [a.where.id, a.create];
      }),
    );
    expect(byId.get('gamejob:10')?.jobFamilies).toEqual(['원화', '이펙트·FX']);
    expect(byId.get('gamejob:10')?.artSubtypes).toEqual([
      '캐릭터',
      '배경·컨셉',
    ]);
    // 원화 직군이 아니면 캐릭터가 제목에 있어도 하위 구분이 붙지 않는다.
    expect(byId.get('gamejob:11')?.jobFamilies).toEqual(['모델링']);
    expect(byId.get('gamejob:11')?.artSubtypes).toEqual([]);
  });
});
