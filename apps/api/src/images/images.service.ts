import { Injectable } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType, ImageStatus } from '@bini/types';
import { GameImageService } from '../image/game-image.service';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES: ImageStatus[] = ['found', 'not_found', 'error'];
function toStatus(v: string): ImageStatus {
  return (STATUSES as string[]).includes(v) ? (v as ImageStatus) : 'error';
}

@Injectable()
export class ImagesService {
  constructor(
    private readonly provider: GameImageService,
    private readonly prisma: PrismaService,
  ) {}

  /** DB 캐시 우선 조회, 미스 시 스크래핑 후 저장. 빈 검색어는 스크래핑하지 않는다. */
  async resolve(query: string, queryType: ImageQueryType): Promise<GameImageResponse> {
    if (query.length === 0) {
      return { query, imageUrl: null, status: 'not_found' };
    }

    const cached = await this.prisma.gameImage.findUnique({ where: { query } });
    if (cached) {
      return { query, imageUrl: cached.imageUrl, status: toStatus(cached.status) };
    }

    const result = await this.provider.search(query);
    await this.prisma.gameImage.upsert({
      where: { query },
      create: {
        query,
        queryType,
        imageUrl: result.imageUrl,
        status: result.status,
        source: this.provider.source,
      },
      update: {
        imageUrl: result.imageUrl,
        status: result.status,
        source: this.provider.source,
        fetchedAt: new Date(),
      },
    });
    return { query, imageUrl: result.imageUrl, status: result.status };
  }
}
