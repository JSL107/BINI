import { Controller, Get, Query } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType } from '@bini/types';
import { ImagesService } from './images.service';

/** 배열로 들어올 수 있는 쿼리 파라미터에서 첫 문자열 값을 꺼낸다. */
function first(v?: string | string[]): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

@Controller('game-image')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  /** GET /api/game-image?q=<검색어>&type=game|company */
  @Get()
  getImage(
    @Query('q') q?: string | string[],
    @Query('type') type?: string | string[],
  ): Promise<GameImageResponse> {
    const query = first(q).trim();
    const queryType: ImageQueryType = first(type).trim() === 'company' ? 'company' : 'game';
    // verifyText=query 자동 부착 — fallback fetch의 cache miss 경로에서도
    // 출처 페이지 title 매칭이 검증되어 회사명/일반어 검색 noise(주가 차트,
    // 제품 사진 등)를 구조적으로 컷한다. 캐시 hit이면 verifyText는 무시.
    return this.imagesService.resolve(query, queryType, { verifyText: query });
  }
}
