import { BadImageService } from './bad-image.service';
import { PrismaService } from '../prisma/prisma.service';

function build(seed: string[] = []) {
  const findMany = jest.fn(async (args: { where: { imageUrl: { in: string[] } } }) => {
    const want = new Set(args.where.imageUrl.in);
    return seed.filter((u) => want.has(u)).map((imageUrl) => ({ imageUrl }));
  });
  const findFirst = jest.fn(async (args: { where: { imageUrl: string } }) => {
    return seed.includes(args.where.imageUrl) ? { id: 'x' } : null;
  });
  const create = jest.fn().mockResolvedValue({});
  const prisma = {
    badImageReport: { findMany, findFirst, create },
  } as unknown as PrismaService;
  return { service: new BadImageService(prisma), findMany, findFirst, create };
}

describe('BadImageService', () => {
  it('filterUrls는 빈 입력에 DB 쿼리 없이 빈 배열을 반환한다', async () => {
    const { service, findMany } = build(['x']);
    expect(await service.filterUrls([])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('filterUrls는 DB의 신고 URL을 제거하고 순서를 보존한다', async () => {
    const { service } = build(['https://b.example.com/x']);
    const out = await service.filterUrls([
      'https://a.example.com/x',
      'https://b.example.com/x',
      'https://c.example.com/x',
    ]);
    expect(out).toEqual(['https://a.example.com/x', 'https://c.example.com/x']);
  });

  it('filterUrls는 신고 row 없으면 입력을 새 배열로 그대로 돌려준다', async () => {
    const { service } = build([]);
    const input = ['https://a/x', 'https://b/y'];
    const out = await service.filterUrls(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('filterUrls는 DB 장애 시 입력을 그대로 통과시킨다 (보수적)', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const prisma = {
      badImageReport: { findMany, findFirst: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService;
    const svc = new BadImageService(prisma);
    expect(await svc.filterUrls(['https://a/x'])).toEqual(['https://a/x']);
  });

  it('isBlocked는 DB의 존재 여부를 반환한다', async () => {
    const { service } = build(['https://blocked/x']);
    expect(await service.isBlocked('https://blocked/x')).toBe(true);
    expect(await service.isBlocked('https://ok/x')).toBe(false);
    expect(await service.isBlocked('')).toBe(false);
  });

  it('report는 DB에 row INSERT (jobId/reason undefined 변환)', async () => {
    const { service, create } = build([]);
    await service.report('https://x.example.com/bad.jpg', 'gamejob:123', 'wrong game');
    expect(create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://x.example.com/bad.jpg',
        jobId: 'gamejob:123',
        reason: 'wrong game',
      },
    });

    await service.report('https://x.example.com/bad2.jpg', null, null);
    expect(create).toHaveBeenLastCalledWith({
      data: {
        imageUrl: 'https://x.example.com/bad2.jpg',
        jobId: undefined,
        reason: undefined,
      },
    });
  });
});
