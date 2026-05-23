import { Injectable, Logger } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType, ImageStatus } from '@bini/types';
import { GameImageService } from '../image/game-image.service';
import { GoogleImageService } from '../image/google-image.service';
import { GoogleCrawlerImageService } from '../image/google-crawler.service';
import type { ImageProvider, ImageResult } from '../image/image-provider';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES: ImageStatus[] = ['found', 'not_found', 'error'];
function toStatus(v: string): ImageStatus {
  return (STATUSES as string[]).includes(v) ? (v as ImageStatus) : 'not_found';
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  // 같은 검색어에 대한 동시 요청이 외부 검색을 중복 호출하지 않도록 진행 중 작업을 공유.
  private readonly inflight = new Map<string, Promise<GameImageResponse>>();

  constructor(
    private readonly naver: GameImageService,
    private readonly googleApi: GoogleImageService,
    private readonly googleCrawler: GoogleCrawlerImageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 캐시 우선 조회. 미스 시 외부 검색을 호출하고 결과를 캐시한다.
   *
   * 검색 우선순위(처음 found가 나오면 거기서 멈춤):
   *   1) GoogleCrawler (Playwright headless chromium, 기본 ON — `GOOGLE_CRAWLER=0`이면 OFF)
   *   2) Google CSE API (env GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID 둘 다 있을 때)
   *   3) Naver 이미지 검색 (항상 사용 가능, 최후 폴백)
   *
   * 빈 검색어는 외부 호출 없이 not_found.
   */
  async resolve(query: string, queryType: ImageQueryType): Promise<GameImageResponse> {
    if (query.length === 0) {
      return { query, imageUrl: null, status: 'not_found' };
    }

    const cached = await this.prisma.gameImage.findUnique({ where: { query } });
    if (cached) {
      // 캐시 무효화: Naver 결과가 not_found였고 지금은 더 강한 제공자가 켜져 있으면 재시도.
      const upgradeable =
        cached.source === 'naver' &&
        cached.status === 'not_found' &&
        (this.googleCrawler.isConfigured() || this.googleApi.isConfigured());
      if (!upgradeable) {
        return { query, imageUrl: cached.imageUrl, status: toStatus(cached.status) };
      }
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
    const chain: Array<{ provider: ImageProvider; active: boolean }> = [
      { provider: this.googleCrawler, active: this.googleCrawler.isConfigured() },
      { provider: this.googleApi, active: this.googleApi.isConfigured() },
      { provider: this.naver, active: true },
    ];

    let result: ImageResult = { imageUrl: null, status: 'error' };
    let source = this.naver.source;

    for (const { provider, active } of chain) {
      if (!active) continue;
      result = await provider.search(query);
      source = provider.source;
      if (result.imageUrl) break;
    }

    if (result.status !== 'error') {
      await this.prisma.gameImage.upsert({
        where: { query },
        create: {
          query,
          queryType,
          imageUrl: result.imageUrl,
          status: result.status,
          source,
        },
        update: {
          imageUrl: result.imageUrl,
          status: result.status,
          source,
          fetchedAt: new Date(),
        },
      });
    }
    return { query, imageUrl: result.imageUrl, status: result.status };
  }
}
