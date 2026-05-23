import { JobsService } from './jobs.service';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { WantedScraperService } from '../scraper/wanted-scraper.service';
import { JobkoreaScraperService } from '../scraper/jobkorea-scraper.service';
import { SaraminScraperService } from '../scraper/saramin-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RawJob } from '../scraper/raw-job';

type ScrapeOk = { jobs: RawJob[]; totalPages: number };

function build(
  gjResult: ScrapeOk | Error,
  wtResult: ScrapeOk | Error,
  jkResult: ScrapeOk | Error,
  srResult: ScrapeOk | Error,
) {
  const upsert = jest.fn().mockResolvedValue(undefined);
  const findMany = jest.fn().mockResolvedValue([]);
  const $transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
  const prisma = {
    job: { upsert, findMany },
    $transaction,
  } as unknown as PrismaService;

  const mkScraper = (
    src: 'gamejob' | 'wanted' | 'jobkorea' | 'saramin',
    r: any,
  ) =>
    ({
      source: src,
      fetchJobList: jest.fn(() =>
        r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
      ),
    } as any);

  const gj = mkScraper('gamejob', gjResult);
  const wt = mkScraper('wanted', wtResult);
  const jk = mkScraper('jobkorea', jkResult);
  const sr = mkScraper('saramin', srResult);
  return {
    service: new JobsService(gj, wt, jk, sr, prisma),
    upsert,
    findMany,
    $transaction,
    gj,
    wt,
    jk,
    sr,
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
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
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
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
    );
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('totalPages는 성공한 소스 중 최대값', async () => {
    const { service } = build(
      { jobs: [gjRaw], totalPages: 3 },
      { jobs: [wtRaw], totalPages: 7 },
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
    );
    const res = await service.getJobsPage(1);
    expect(res.totalPages).toBe(7);
    expect(res.page).toBe(1);
  });

  it('한 소스 실패해도 다른 소스 결과로 응답하고 failedSources를 노출한다', async () => {
    const { service, upsert } = build(
      new Error('gamejob down'),
      { jobs: [wtRaw], totalPages: 5 },
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
    );
    const res = await service.getJobsPage(1);
    expect(res.failedSources).toEqual(['gamejob']);
    expect(res.totalPages).toBe(5);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.create.source).toBe('wanted');
  });

  it('모든 소스 실패 시 502 throw', async () => {
    const { service } = build(
      new Error('a'),
      new Error('b'),
      new Error('c'),
      new Error('d'),
    );
    await expect(service.getJobsPage(1)).rejects.toThrow();
  });

  it('성공한 소스가 0건이어도 failedSources는 비어 있다', async () => {
    const { service, upsert } = build(
      { jobs: [gjRaw], totalPages: 1 },
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
    );
    const res = await service.getJobsPage(1);
    expect(res.failedSources).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('잡코리아 결과도 라우팅에 합류한다', async () => {
    const jkRaw: RawJob = {
      source: 'jobkorea',
      sourceId: '49228661',
      company: '잡코리아테스트',
      companyUrl: '',
      title: '캐릭터 원화 디자이너',
      detailUrl: 'https://www.jobkorea.co.kr/Recruit/GI_Read/49228661',
      deadline: '상시',
      registeredAtText: '',
      tags: ['서울'],
    };
    const { service, upsert } = build(
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
      { jobs: [jkRaw], totalPages: 5 },
      { jobs: [], totalPages: 1 },
    );
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.source).toBe('jobkorea');
    expect(upsert.mock.calls[0][0].where).toEqual({ id: 'jobkorea:49228661' });
  });

  it('사람인 결과도 라우팅에 합류한다', async () => {
    const srRaw: RawJob = {
      source: 'saramin',
      sourceId: '53625619',
      company: '사람인테스트',
      companyUrl: '',
      title: '[신입/경력] 게임 아트 원화가 모집',
      detailUrl: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=53625619',
      deadline: '~ 06/13(토)',
      registeredAtText: '등록일 26/04/14',
      tags: ['서울', '경력무관'],
    };
    const { service, upsert } = build(
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
      { jobs: [], totalPages: 1 },
      { jobs: [srRaw], totalPages: 2 },
    );
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.source).toBe('saramin');
    expect(upsert.mock.calls[0][0].where).toEqual({ id: 'saramin:53625619' });
  });
});
