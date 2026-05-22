import { ImagesService } from './images.service';
import { GameImageService } from '../image/game-image.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImagesService', () => {
  function build() {
    const findUnique = jest.fn();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const search = jest.fn();
    const prisma = { gameImage: { findUnique, upsert } } as unknown as PrismaService;
    const provider = { search, source: 'naver' } as unknown as GameImageService;
    return { service: new ImagesService(provider, prisma), findUnique, upsert, search };
  }

  it('DB 캐시 히트 시 스크래핑하지 않는다', async () => {
    const { service, findUnique, search } = build();
    findUnique.mockResolvedValue({
      query: '원신 게임', queryType: 'game',
      imageUrl: 'https://img/cached.jpg', status: 'found',
    });
    const result = await service.resolve('원신 게임', 'game');
    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({
      query: '원신 게임', imageUrl: 'https://img/cached.jpg', status: 'found',
    });
  });

  it('캐시 미스 시 스크래핑 후 결과를 저장한다', async () => {
    const { service, findUnique, upsert, search } = build();
    findUnique.mockResolvedValue(null);
    search.mockResolvedValue({ imageUrl: 'https://img/new.jpg', status: 'found' });
    const result = await service.resolve('블루아카이브 게임', 'game');
    expect(search).toHaveBeenCalledWith('블루아카이브 게임');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBe('https://img/new.jpg');
    expect(result.status).toBe('found');
  });

  it('빈 검색어는 스크래핑·DB조회 없이 not_found를 반환한다', async () => {
    const { service, findUnique, search } = build();
    const result = await service.resolve('', 'company');
    expect(findUnique).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({ query: '', imageUrl: null, status: 'not_found' });
  });
});
