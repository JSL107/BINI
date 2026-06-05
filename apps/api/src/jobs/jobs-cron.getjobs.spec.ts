import { JobsCronService } from './jobs-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { ThumbnailService } from './thumbnail.service';

/**
 * getJobsFromDb의 priority 카드 썸네일 주입 동작.
 * - page===1의 첫 3개(priority) row만 ThumbnailService로 resolve해 thumbnailUrl 주입
 * - 그 외 카드/페이지는 thumbnailUrl=null
 * - 썸네일 resolve 실패는 목록 응답을 깨뜨리지 않는다 (신뢰성 우선)
 */
describe('JobsCronService.getJobsFromDb — priority 썸네일 주입', () => {
  function jobRow(id: string, over: Record<string, unknown> = {}) {
    return {
      id,
      source: 'gamejob',
      company: '테스트회사',
      companyUrl: 'https://co',
      title: '원화가',
      detailUrl: 'https://detail',
      deadline: '상시',
      deadlineAt: null,
      registeredAt: new Date('2026-01-01T00:00:00Z'),
      tags: [],
      gameTitle: null,
      imageQuery: '',
      imageQueryType: 'company',
      companyLogoUrl: null,
      companyPhotos: [],
      representativeGames: [],
      bodyImages: [],
      lastSeenAt: new Date('2026-06-01T00:00:00Z'),
      expiredAt: null,
      experienceLevel: null,
      employmentType: null,
      locations: [],
      isRemote: false,
      aliases: [],
      ...over,
    };
  }

  function build(
    rows: ReturnType<typeof jobRow>[],
    total: number,
    thumbnail: { map?: Map<string, string>; error?: boolean } = {},
  ) {
    const dummy = {} as never;
    const count = jest.fn().mockResolvedValue(total);
    const findMany = jest.fn().mockResolvedValue(rows);
    const jpFindMany = jest.fn().mockResolvedValue([]);
    const $transaction = jest
      .fn()
      .mockImplementation((arr: Promise<unknown>[]) => Promise.all(arr));
    const prisma = {
      job: { count, findMany },
      jobplanetCompany: { findMany: jpFindMany },
      $transaction,
    } as unknown as PrismaService;

    const resolveCachedThumbnails = jest.fn().mockImplementation(async () => {
      if (thumbnail.error) throw new Error('thumbnail boom');
      return thumbnail.map ?? new Map<string, string>();
    });
    const thumbnails = {
      resolveCachedThumbnails,
    } as unknown as ThumbnailService;

    const service = new JobsCronService(
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      prisma,
      dummy,
      dummy,
      dummy,
      dummy,
      thumbnails,
    );
    return { service, resolveCachedThumbnails };
  }

  it('page 1이면 첫 3개 카드에만 썸네일을 주입한다', async () => {
    const rows = [jobRow('j1'), jobRow('j2'), jobRow('j3'), jobRow('j4')];
    const map = new Map([
      ['j1', 'https://t1.jpg'],
      ['j2', 'https://t2.jpg'],
    ]);
    const { service, resolveCachedThumbnails } = build(rows, 4, { map });
    const res = await service.getJobsFromDb(1);

    expect(res.jobs[0].thumbnailUrl).toBe('https://t1.jpg');
    expect(res.jobs[1].thumbnailUrl).toBe('https://t2.jpg');
    expect(res.jobs[2].thumbnailUrl).toBeNull(); // 캐시 미스
    expect(res.jobs[3].thumbnailUrl).toBeNull(); // priority 밖(idx>=3)

    // resolve에는 첫 3개 candidate만 넘어간다
    const candidates = resolveCachedThumbnails.mock.calls[0][0] as Array<{
      id: string;
    }>;
    expect(candidates.map((c) => c.id)).toEqual(['j1', 'j2', 'j3']);
  });

  it('priority candidate에는 row의 이미지 후보 필드가 담긴다', async () => {
    const rows = [
      jobRow('j1', {
        bodyImages: ['https://body.jpg'],
        representativeGames: ['원신'],
        imageQuery: '프로젝트',
        imageQueryType: 'game',
      }),
    ];
    const { service, resolveCachedThumbnails } = build(rows, 1, {
      map: new Map(),
    });
    await service.getJobsFromDb(1);
    const candidate = (
      resolveCachedThumbnails.mock.calls[0][0] as Array<Record<string, unknown>>
    )[0];
    expect(candidate).toMatchObject({
      id: 'j1',
      bodyImages: ['https://body.jpg'],
      representativeGames: ['원신'],
      imageQuery: '프로젝트',
      imageQueryType: 'game',
    });
  });

  it('page 2면 썸네일 resolve를 호출하지 않고 모두 null', async () => {
    const rows = [jobRow('j1'), jobRow('j2')];
    const { service, resolveCachedThumbnails } = build(rows, 100, {
      map: new Map([['j1', 'https://x.jpg']]),
    });
    const res = await service.getJobsFromDb(2);

    expect(resolveCachedThumbnails).not.toHaveBeenCalled();
    expect(res.jobs.every((j) => j.thumbnailUrl === null)).toBe(true);
  });

  it('썸네일 resolve가 throw해도 목록 응답은 정상(thumbnailUrl 전부 null)', async () => {
    const rows = [jobRow('j1')];
    const { service } = build(rows, 1, { error: true });
    const res = await service.getJobsFromDb(1);

    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0].thumbnailUrl).toBeNull();
  });
});
