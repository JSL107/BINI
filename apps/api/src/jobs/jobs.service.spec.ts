import { JobsService } from './jobs.service';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RawJob } from '../scraper/raw-job';

type ScrapeOk = { jobs: RawJob[]; totalPages: number };

function build(
  gjResult: ScrapeOk | Error,
  wtResult: ScrapeOk | Error,
) {
  const upsert = jest.fn().mockResolvedValue(undefined);
  const findMany = jest.fn().mockResolvedValue([]);
  const $transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
  const prisma = {
    job: { upsert, findMany },
    $transaction,
  } as unknown as PrismaService;

  const mkScraper = (src: 'gamejob' | 'wanted', r: any) =>
    ({
      source: src,
      fetchJobList: jest.fn(() =>
        r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
      ),
    } as any);

  const gj = mkScraper('gamejob', gjResult);
  const wt = mkScraper('wanted', wtResult);
  return {
    service: new JobsService(gj, wt, prisma),
    upsert,
    findMany,
    $transaction,
    gj,
    wt,
  };
}

const gjRaw: RawJob = {
  source: 'gamejob',
  sourceId: '278454',
  company: '게임듀오',
  companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
  title: '[p.일렌시아] 배경 도트 디자이너',
  detailUrl: 'https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454',
  deadline: '상시',
  registeredAtText: '4시간 전 등록',
  tags: [],
};

const wtRaw: RawJob = {
  source: 'wanted',
  sourceId: '999',
  company: '게임듀오',
  companyUrl: 'https://www.wanted.co.kr/company/13711',
  title: 'p.일렌시아 배경 도트 디자이너',
  detailUrl: 'https://www.wanted.co.kr/wd/999',
  deadline: '상시',
  registeredAtText: '',
  tags: ['서울'],
};

describe('JobsService', () => {
  it('두 소스의 결과를 dedup하여 1건만 upsert한다', async () => {
    const { service, upsert } = build(
      { jobs: [gjRaw], totalPages: 3 },
      { jobs: [wtRaw], totalPages: 5 },
    );
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    // 게임잡이 입력 순서상 먼저이므로 primary 채택
    expect(arg.where).toEqual({ id: 'gamejob:278454' });
    expect(arg.create.source).toBe('gamejob');
    expect(arg.create.sourceId).toBe('278454');
  });

  it('서로 다른 공고 두 건은 각각 upsert된다', async () => {
    const otherWt: RawJob = { ...wtRaw, sourceId: '1000', company: '딴회사' };
    const { service, upsert } = build(
      { jobs: [gjRaw], totalPages: 3 },
      { jobs: [otherWt], totalPages: 5 },
    );
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('totalPages는 성공한 소스 중 최대값', async () => {
    const { service } = build(
      { jobs: [gjRaw], totalPages: 3 },
      { jobs: [wtRaw], totalPages: 7 },
    );
    const res = await service.getJobsPage(1);
    expect(res.totalPages).toBe(7);
    expect(res.page).toBe(1);
  });

  it('한 소스 실패해도 다른 소스 결과로 응답하고 failedSources를 노출한다', async () => {
    const { service, upsert } = build(
      new Error('gamejob down'),
      { jobs: [wtRaw], totalPages: 5 },
    );
    const res = await service.getJobsPage(1);
    expect(res.failedSources).toEqual(['gamejob']);
    expect(res.totalPages).toBe(5);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.create.source).toBe('wanted');
  });

  it('모든 소스 실패 시 502 throw', async () => {
    const { service } = build(new Error('a'), new Error('b'));
    await expect(service.getJobsPage(1)).rejects.toThrow();
  });

  it('성공한 소스가 0건이어도 failedSources는 비어 있다', async () => {
    const { service, upsert } = build(
      { jobs: [gjRaw], totalPages: 1 },
      { jobs: [], totalPages: 1 },
    );
    const res = await service.getJobsPage(1);
    expect(res.failedSources).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
