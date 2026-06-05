import {
  ThumbnailService,
  type ThumbnailCandidateRow,
} from './thumbnail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ThumbnailService: getJobsFromDb의 priority 카드용 "외부 호출 0번" 썸네일 resolve.
 * combineImages(JobImagesService)의 신뢰도 우선순위를 캐시/row 조회만으로 재현한다:
 *   bodyImages[0] > 나무위키 캐시 > game_images 캐시(대표게임 검색어) > bracket
 * 모든 lookup은 prisma IN 쿼리. 외부(Naver/스크래핑) 호출은 절대 하지 않는다.
 */
describe('ThumbnailService', () => {
  function build() {
    const namuwikiFindMany = jest.fn().mockResolvedValue([]);
    const gameImageFindMany = jest.fn().mockResolvedValue([]);
    const badImageFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      namuwikiImage: { findMany: namuwikiFindMany },
      gameImage: { findMany: gameImageFindMany },
      badImageReport: { findMany: badImageFindMany },
    } as unknown as PrismaService;
    return {
      service: new ThumbnailService(prisma),
      namuwikiFindMany,
      gameImageFindMany,
      badImageFindMany,
    };
  }

  function row(
    over: Partial<ThumbnailCandidateRow> = {},
  ): ThumbnailCandidateRow {
    return {
      id: 'gamejob:1',
      bodyImages: [],
      representativeGames: [],
      company: '테스트회사',
      imageQuery: '',
      imageQueryType: 'company',
      ...over,
    };
  }

  it('bodyImages[0]을 최우선 썸네일로 반환한다', async () => {
    const { service } = build();
    const result = await service.resolveCachedThumbnails([
      row({
        id: 'j1',
        bodyImages: ['https://img/body1.jpg', 'https://img/body2.jpg'],
      }),
    ]);
    expect(result.get('j1')).toBe('https://img/body1.jpg');
  });

  it('bodyImages가 없으면 나무위키 캐시 히트를 쓴다', async () => {
    const { service, namuwikiFindMany } = build();
    namuwikiFindMany.mockResolvedValue([
      { gameName: '원신', imageUrl: 'https://img/namu.jpg', status: 'found' },
    ]);
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', representativeGames: ['원신'] }),
    ]);
    expect(result.get('j1')).toBe('https://img/namu.jpg');
  });

  it('나무위키도 없으면 game_images 캐시(대표게임+회사명 검색어)를 쓴다', async () => {
    const { service, gameImageFindMany } = build();
    gameImageFindMany.mockResolvedValue([
      {
        query: '원신 테스트회사 게임',
        imageUrl: 'https://img/gi.jpg',
        status: 'found',
      },
    ]);
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', representativeGames: ['원신'], company: '테스트회사' }),
    ]);
    expect(result.get('j1')).toBe('https://img/gi.jpg');
  });

  it('대표게임이 없고 imageQuery가 게임명이면 bracket game_images 캐시를 쓴다', async () => {
    const { service, gameImageFindMany } = build();
    gameImageFindMany.mockResolvedValue([
      {
        query: '프로젝트 ES',
        imageUrl: 'https://img/bracket.jpg',
        status: 'found',
      },
    ]);
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', imageQuery: '프로젝트 ES', imageQueryType: 'game' }),
    ]);
    expect(result.get('j1')).toBe('https://img/bracket.jpg');
  });

  it('imageQuery가 generic term(예: 3D 모델링)이면 bracket을 쓰지 않는다', async () => {
    const { service } = build();
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', imageQuery: '3D 모델링', imageQueryType: 'game' }),
    ]);
    expect(result.has('j1')).toBe(false);
  });

  it('모든 소스가 미스면 결과 맵에 없다 (null 폴백)', async () => {
    const { service } = build();
    const result = await service.resolveCachedThumbnails([row({ id: 'j1' })]);
    expect(result.has('j1')).toBe(false);
  });

  it('신고된 URL은 건너뛰고 다음 우선순위 후보를 쓴다', async () => {
    const { service, namuwikiFindMany, badImageFindMany } = build();
    namuwikiFindMany.mockResolvedValue([
      { gameName: '원신', imageUrl: 'https://img/namu.jpg', status: 'found' },
    ]);
    badImageFindMany.mockResolvedValue([
      { imageUrl: 'https://img/body-bad.jpg' },
    ]);
    const result = await service.resolveCachedThumbnails([
      row({
        id: 'j1',
        bodyImages: ['https://img/body-bad.jpg'],
        representativeGames: ['원신'],
      }),
    ]);
    // bodyImages[0]이 신고됨 → 나무위키로 폴백
    expect(result.get('j1')).toBe('https://img/namu.jpg');
  });

  it('status가 found가 아닌 나무위키/game_images 행은 무시한다', async () => {
    const { service, namuwikiFindMany, gameImageFindMany } = build();
    namuwikiFindMany.mockResolvedValue([
      { gameName: '원신', imageUrl: null, status: 'not_found' },
    ]);
    gameImageFindMany.mockResolvedValue([
      {
        query: '원신 테스트회사 게임',
        imageUrl: 'https://x',
        status: 'blocked',
      },
    ]);
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', representativeGames: ['원신'], company: '테스트회사' }),
    ]);
    expect(result.has('j1')).toBe(false);
  });

  it('여러 잡을 batch로 처리하고 bad-image는 1회만 조회한다', async () => {
    const { service, badImageFindMany } = build();
    const result = await service.resolveCachedThumbnails([
      row({ id: 'j1', bodyImages: ['https://img/a.jpg'] }),
      row({ id: 'j2', bodyImages: ['https://img/b.jpg'] }),
    ]);
    expect(result.get('j1')).toBe('https://img/a.jpg');
    expect(result.get('j2')).toBe('https://img/b.jpg');
    expect(badImageFindMany).toHaveBeenCalledTimes(1);
  });

  it('빈 입력은 빈 맵을 반환하고 어떤 쿼리도 하지 않는다', async () => {
    const { service, namuwikiFindMany, gameImageFindMany, badImageFindMany } =
      build();
    const result = await service.resolveCachedThumbnails([]);
    expect(result.size).toBe(0);
    expect(namuwikiFindMany).not.toHaveBeenCalled();
    expect(gameImageFindMany).not.toHaveBeenCalled();
    expect(badImageFindMany).not.toHaveBeenCalled();
  });
});
