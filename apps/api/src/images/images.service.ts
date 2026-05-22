import { Injectable } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType, ImageStatus } from '@bini/types';
import { GameImageService } from '../image/game-image.service';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES: ImageStatus[] = ['found', 'not_found', 'error'];
function toStatus(v: string): ImageStatus {
  // 알 수 없는 값은 not_found로 — 프론트엔드에 가장 무해한 표시(플레이스홀더).
  return (STATUSES as string[]).includes(v) ? (v as ImageStatus) : 'not_found';
}

@Injectable()
export class ImagesService {
  // 같은 검색어에 대한 동시 요청이 네이버를 중복 스크래핑하지 않도록 진행 중 작업을 공유.
  private readonly inflight = new Map<string, Promise<GameImageResponse>>();

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

    const existing = this.inflight.get(query);
    if (existing) return existing;

    const work = this.fetchAndCache(query, queryType);
    this.inflight.set(query, work);
    try {
      return await work;
    } finally {
      this.inflight.delete(query);
    }
  }

  private async fetchAndCache(
    query: string,
    queryType: ImageQueryType,
  ): Promise<GameImageResponse> {
    const result = await this.provider.search(query);
    // 일시적 실패(error)는 캐시하지 않는다 — 다음 요청에서 재시도되도록.
    if (result.status !== 'error') {
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
    }
    return { query, imageUrl: result.imageUrl, status: result.status };
  }
}
