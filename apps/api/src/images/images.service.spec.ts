import { ImagesService } from './images.service';
import { GameImageService } from '../image/game-image.service';
import { GoogleImageService } from '../image/google-image.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImagesService', () => {
  function build() {
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue(undefined);
    const search = jest.fn();
    const googleSearch = jest.fn().mockResolvedValue({ imageUrl: null, status: 'not_found' });
    const prisma = { gameImage: { findUnique, upsert } } as unknown as PrismaService;
    const provider = { search, source: 'naver' } as unknown as GameImageService;
    const googleApi = { search: googleSearch, source: 'google-api' } as unknown as GoogleImageService;
    return {
      service: new ImagesService(provider, googleApi, prisma),
      findUnique,
      upsert,
      search,
      googleSearch,
    };
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

  it('알 수 없는 캐시 status는 not_found로 보정한다', async () => {
    const { service, findUnique } = build();
    findUnique.mockResolvedValue({
      query: 'x', queryType: 'game', imageUrl: null, status: '이상한값',
    });
    const result = await service.resolve('x', 'game');
    expect(result.status).toBe('not_found');
  });

  it('캐시 미스 시 스크래핑 후 결과를 저장한다', async () => {
    const { service, upsert, search } = build();
    search.mockResolvedValue({ imageUrl: 'https://img/new.jpg', status: 'found' });
    const result = await service.resolve('블루아카이브 게임', 'game');
    expect(search).toHaveBeenCalledWith('블루아카이브 게임');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBe('https://img/new.jpg');
  });

  it('error 상태 결과는 DB에 저장하지 않는다 (재시도 가능하도록)', async () => {
    const { service, upsert, search } = build();
    search.mockResolvedValue({ imageUrl: null, status: 'error' });
    const result = await service.resolve('실패 게임', 'game');
    expect(upsert).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
  });

  it('not_found 결과는 DB에 저장한다', async () => {
    const { service, upsert, search } = build();
    search.mockResolvedValue({ imageUrl: null, status: 'not_found' });
    await service.resolve('없는 게임', 'game');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('빈 검색어는 스크래핑·DB조회 없이 not_found를 반환한다', async () => {
    const { service, findUnique, search } = build();
    const result = await service.resolve('', 'company');
    expect(findUnique).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({ query: '', imageUrl: null, status: 'not_found' });
  });

  it('같은 검색어 동시 요청은 한 번만 스크래핑한다', async () => {
    const { service, search } = build();
    let resolveSearch!: (v: unknown) => void;
    search.mockReturnValue(new Promise((r) => { resolveSearch = r; }));
    const p1 = service.resolve('동시 게임', 'game');
    const p2 = service.resolve('동시 게임', 'game');
    await Promise.resolve();
    resolveSearch({ imageUrl: 'https://img/x.jpg', status: 'found' });
    await Promise.all([p1, p2]);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
