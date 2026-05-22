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
    const queryType: ImageQueryType = first(type).trim() === 'company' ? 'company' : 'game';
    return this.imagesService.resolve(first(q).trim(), queryType);
  }
}
