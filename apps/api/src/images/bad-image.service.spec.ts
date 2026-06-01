import { BadImageService } from './bad-image.service';
import { PrismaService } from '../prisma/prisma.service';

function build() {
  const findMany = jest.fn().mockResolvedValue([]);
  const create = jest.fn().mockResolvedValue({});
  const prisma = {
    badImageReport: { findMany, create },
  } as unknown as PrismaService;
  return { service: new BadImageService(prisma), findMany, create };
}

describe('BadImageService', () => {
  it('filterUrls: 빈 입력엔 DB query 없이 빈 배열 반환', async () => {
    const { service, findMany } = build();
    const out = await service.filterUrls([]);
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('filterUrls: 차단 URL이 없으면 입력을 그대로 새 배열로 반환', async () => {
    const { service, findMany } = build();
    const input = ['https://a/x', 'https://b/x'];
    const out = await service.filterUrls(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(findMany).toHaveBeenCalledWith({
      where: { imageUrl: { in: input } },
      select: { imageUrl: true },
    });
  });

  it('filterUrls: 차단된 URL을 제거하고 순서를 보존한다', async () => {
    const { service, findMany } = build();
    findMany.mockResolvedValueOnce([{ imageUrl: 'https://b/x' }]);
    const out = await service.filterUrls([
      'https://a/x',
      'https://b/x',
      'https://c/x',
    ]);
    expect(out).toEqual(['https://a/x', 'https://c/x']);
  });

  it('report: DB INSERT — jobId/reason 전달', async () => {
    const { service, create } = build();
    await service.report('https://x/bad', 'gamejob:123', 'wrong game');
    expect(create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://x/bad',
        jobId: 'gamejob:123',
        reason: 'wrong game',
      },
    });
  });

  it('report: jobId/reason이 null이면 Prisma에 undefined로 변환해 전달', async () => {
    const { service, create } = build();
    await service.report('https://x/bad', null, null);
    expect(create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://x/bad',
        jobId: undefined,
        reason: undefined,
      },
    });
  });

  /**
   * Vercel 서버리스 다중 인스턴스 회귀 가드: 한 인스턴스에서 report 후 다른
   * 인스턴스가 응답해도, 메모리 캐시가 없으므로 DB lookup으로 즉시 차단된다.
   */
  it('report 직후 filterUrls는 신고된 URL을 즉시 차단한다 (메모리 캐시 미사용 회귀 가드)', async () => {
    const reported: string[] = [];
    const findMany = jest.fn().mockImplementation((args: {
      where: { imageUrl: { in: string[] } };
    }) =>
      Promise.resolve(
        reported
          .filter((u) => args.where.imageUrl.in.includes(u))
          .map((u) => ({ imageUrl: u })),
      ),
    );
    const create = jest.fn().mockImplementation((args: { data: { imageUrl: string } }) => {
      reported.push(args.data.imageUrl);
      return Promise.resolve({});
    });
    const prisma = {
      badImageReport: { findMany, create },
    } as unknown as PrismaService;
    const service = new BadImageService(prisma);

    await service.report('https://x/bad', null, null);
    const out = await service.filterUrls(['https://x/bad', 'https://ok/y']);
    expect(out).toEqual(['https://ok/y']);
  });
});
