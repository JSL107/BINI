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

/**
 * `findMany` mock이 공유 `reported` 배열을 DB처럼 사용하고,
 * `create` mock이 같은 배열에 push — 이걸 같이 쓰면 여러 BadImageService 인스턴스가
 * 같은 "DB"를 공유하는 시나리오를 시뮬레이션할 수 있다.
 */
function buildSharedDb() {
  const reported: string[] = [];
  const findMany = jest
    .fn()
    .mockImplementation((args: { where: { imageUrl: { in: string[] } } }) =>
      Promise.resolve(
        reported
          .filter((u) => args.where.imageUrl.in.includes(u))
          .map((u) => ({ imageUrl: u })),
      ),
    );
  const create = jest
    .fn()
    .mockImplementation((args: { data: { imageUrl: string } }) => {
      reported.push(args.data.imageUrl);
      return Promise.resolve({});
    });
  const prisma = {
    badImageReport: { findMany, create },
  } as unknown as PrismaService;
  return { prisma, findMany, create, reported };
}

describe('BadImageService', () => {
  describe('findBlocked', () => {
    it('빈 입력엔 DB query 없이 빈 Set 반환', async () => {
      const { service, findMany } = build();
      const out = await service.findBlocked([]);
      expect(out.size).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('입력에 신고된 URL이 없으면 빈 Set 반환', async () => {
      const { service, findMany } = build();
      const out = await service.findBlocked(['https://a/x', 'https://b/x']);
      expect(out.size).toBe(0);
      expect(findMany).toHaveBeenCalledWith({
        where: { imageUrl: { in: ['https://a/x', 'https://b/x'] } },
        select: { imageUrl: true },
      });
    });

    it('신고된 URL만 Set에 포함시킨다', async () => {
      const { service, findMany } = build();
      findMany.mockResolvedValueOnce([{ imageUrl: 'https://b/x' }]);
      const out = await service.findBlocked([
        'https://a/x',
        'https://b/x',
        'https://c/x',
      ]);
      expect([...out]).toEqual(['https://b/x']);
    });
  });

  describe('filterUrls', () => {
    it('빈 입력엔 빈 배열 반환', async () => {
      const { service, findMany } = build();
      const out = await service.filterUrls([]);
      expect(out).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('차단 URL이 없으면 입력을 그대로 새 배열로 반환', async () => {
      const { service } = build();
      const input = ['https://a/x', 'https://b/x'];
      const out = await service.filterUrls(input);
      expect(out).toEqual(input);
      expect(out).not.toBe(input);
    });

    it('차단된 URL을 제거하고 순서를 보존한다', async () => {
      const { service, findMany } = build();
      findMany.mockResolvedValueOnce([{ imageUrl: 'https://b/x' }]);
      const out = await service.filterUrls([
        'https://a/x',
        'https://b/x',
        'https://c/x',
      ]);
      expect(out).toEqual(['https://a/x', 'https://c/x']);
    });
  });

  describe('report', () => {
    it('DB INSERT — jobId/reason 전달', async () => {
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

    it('jobId/reason이 null이면 Prisma에 undefined로 변환해 전달', async () => {
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
  });

  /**
   * 핵심 회귀 가드: Vercel 서버리스에서 인스턴스 A가 신고를 처리한 직후
   * 인스턴스 B에 라우팅된 응답이 stale 캐시로 신고된 url을 그대로 노출하던 버그.
   * 메모리 캐시 없이 매 호출 DB lookup이므로 신고 직후의 다른 인스턴스도 즉시 반영.
   */
  describe('cross-instance staleness 회귀 가드', () => {
    it('A에서 report → B의 filterUrls가 즉시 차단', async () => {
      const { prisma } = buildSharedDb();
      const instanceA = new BadImageService(prisma);
      const instanceB = new BadImageService(prisma);
      await instanceA.report('https://x/bad', null, null);
      const out = await instanceB.filterUrls(['https://x/bad', 'https://ok/y']);
      expect(out).toEqual(['https://ok/y']);
    });

    it('A에서 report → B의 findBlocked가 즉시 차단 url을 보고', async () => {
      const { prisma } = buildSharedDb();
      const instanceA = new BadImageService(prisma);
      const instanceB = new BadImageService(prisma);
      await instanceA.report('https://x/bad', 'gamejob:1', null);
      const blocked = await instanceB.findBlocked([
        'https://x/bad',
        'https://ok/y',
      ]);
      expect([...blocked]).toEqual(['https://x/bad']);
    });
  });
});
