import { BadImageService } from './bad-image.service';
import { PrismaService } from '../prisma/prisma.service';

function build(seed: string[] = []) {
  const findMany = jest
    .fn()
    .mockResolvedValue(seed.map((imageUrl) => ({ imageUrl })));
  const create = jest.fn().mockResolvedValue({});
  const prisma = {
    badImageReport: { findMany, create },
  } as unknown as PrismaService;
  return { service: new BadImageService(prisma), findMany, create };
}

describe('BadImageService', () => {
  it('onModuleInit 시 DB에서 신고된 URL을 메모리 set으로 로드한다', async () => {
    const { service, findMany } = build([
      'https://bad.example.com/1.jpg',
      'https://bad.example.com/2.jpg',
    ]);
    await service.onModuleInit();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(service.isBlocked('https://bad.example.com/1.jpg')).toBe(true);
    expect(service.isBlocked('https://bad.example.com/2.jpg')).toBe(true);
    expect(service.isBlocked('https://ok.example.com/x.jpg')).toBe(false);
  });

  it('onModuleInit DB 실패 시에도 throw하지 않고 빈 set으로 계속한다', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const create = jest.fn();
    const prisma = {
      badImageReport: { findMany, create },
    } as unknown as PrismaService;
    const svc = new BadImageService(prisma);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    expect(svc.isBlocked('anything')).toBe(false);
  });

  it('filterUrls는 차단 URL을 제거하고 순서를 보존한다', async () => {
    const { service } = build(['https://b.example.com/x']);
    await service.onModuleInit();
    const out = service.filterUrls([
      'https://a.example.com/x',
      'https://b.example.com/x',
      'https://c.example.com/x',
    ]);
    expect(out).toEqual(['https://a.example.com/x', 'https://c.example.com/x']);
  });

  it('차단된 게 없으면 입력을 그대로 새 배열로 반환 (참조 동일 X)', async () => {
    const { service } = build([]);
    await service.onModuleInit();
    const input = ['https://a/x'];
    const out = service.filterUrls(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input); // 새 배열
  });

  it('report는 DB INSERT + 메모리 set에 즉시 추가한다', async () => {
    const { service, create } = build([]);
    await service.onModuleInit();
    expect(service.isBlocked('https://x.example.com/bad.jpg')).toBe(false);
    await service.report('https://x.example.com/bad.jpg', 'gamejob:123', 'wrong game');
    expect(create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://x.example.com/bad.jpg',
        jobId: 'gamejob:123',
        reason: 'wrong game',
      },
    });
    expect(service.isBlocked('https://x.example.com/bad.jpg')).toBe(true);
  });

  it('report 시 jobId/reason이 null이면 Prisma에 undefined로 변환해 전달', async () => {
    const { service, create } = build([]);
    await service.onModuleInit();
    await service.report('https://x.example.com/bad.jpg', null, null);
    expect(create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://x.example.com/bad.jpg',
        jobId: undefined,
        reason: undefined,
      },
    });
  });
});
