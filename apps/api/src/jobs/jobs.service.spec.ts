import { JobsService } from './jobs.service';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JobsService', () => {
  const sampleRaw = {
    id: '278454',
    company: '게임듀오',
    companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
    title: '[p.일렌시아] 배경 도트 디자이너',
    detailUrl: 'https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454',
    deadline: '상시',
    registeredAtText: '4시간 전 등록',
    tags: ['신입', '경기'],
  };

  function build(scrapeResult: { jobs: any[]; totalPages: number }) {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { job: { upsert, findMany } } as unknown as PrismaService;
    const scraper = {
      fetchJobList: jest.fn().mockResolvedValue(scrapeResult),
    } as unknown as GamejobScraperService;
    return { service: new JobsService(scraper, prisma), upsert, findMany };
  }

  it('스크래핑한 공고를 제목 분류와 함께 upsert한다', async () => {
    const { service, upsert } = build({ jobs: [sampleRaw], totalPages: 3 });
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: '278454' });
    expect(arg.create.gameTitle).toBe('p.일렌시아');
    expect(arg.create.imageQueryType).toBe('game');
  });

  it('totalPages와 page를 응답에 포함한다', async () => {
    const { service } = build({ jobs: [sampleRaw], totalPages: 3 });
    const result = await service.getJobsPage(1);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
  });

  it('DB에서 읽은 행을 Job DTO(registeredAt ISO 문자열)로 변환해 반환한다', async () => {
    const { service, findMany } = build({ jobs: [sampleRaw], totalPages: 1 });
    findMany.mockResolvedValue([
      {
        id: '278454', company: '게임듀오', companyUrl: 'https://c/1',
        title: '[p.일렌시아] 배경 도트 디자이너', detailUrl: 'https://d/1',
        deadline: '상시', registeredAt: new Date('2026-05-22T08:00:00.000Z'),
        tags: ['신입'], gameTitle: 'p.일렌시아', imageQuery: 'p.일렌시아 게임',
        imageQueryType: 'game',
      },
    ]);
    const result = await service.getJobsPage(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].id).toBe('278454');
    expect(result.jobs[0].registeredAt).toBe('2026-05-22T08:00:00.000Z');
    expect(result.jobs[0].imageQueryType).toBe('game');
  });
});
