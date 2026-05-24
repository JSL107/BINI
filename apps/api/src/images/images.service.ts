import { Injectable, Logger } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType, ImageStatus } from '@bini/types';
import { GameImageService } from '../image/game-image.service';
import { GoogleImageService } from '../image/google-image.service';
import type {
  ImageProvider,
  ImageResult,
  SearchOptions,
} from '../image/image-provider';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES: ImageStatus[] = ['found', 'not_found', 'error', 'blocked'];
function toStatus(v: string): ImageStatus {
  return (STATUSES as string[]).includes(v) ? (v as ImageStatus) : 'not_found';
}

/**
 * Vercel/runtime 이미지 조회 — DB 캐시 우선, 미스 시 가벼운 외부 API만 호출.
 *
 * 우선순위:
 *   1) `game_images` 캐시 히트 → 그대로 반환 (`apps/crawler`가 cron으로 채워두는 Google 결과 포함)
 *   2) 캐시 미스 시 Google CSE API (env GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID 둘 다 있을 때)
 *   3) Naver 이미지 검색 (최후 폴백)
 *
 * 런타임에서 Playwright나 헤드리스 브라우저는 호출하지 않는다 (Vercel 서버리스 무관용).
 * 대신 `apps/crawler` 워크스페이스가 GitHub Actions cron으로 Google 크롤링을 돌려
 * `game_images`에 미리 채워두는 구조.
 */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  // 같은 검색어 동시 요청이 외부 검색을 중복 호출하지 않도록 진행 중 작업을 공유.
  private readonly inflight = new Map<string, Promise<GameImageResponse>>();

  constructor(
    private readonly naver: GameImageService,
    private readonly googleApi: GoogleImageService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(
    query: string,
    queryType: ImageQueryType,
    options?: SearchOptions,
  ): Promise<GameImageResponse> {
    if (query.length === 0) {
      return { query, imageUrl: null, status: 'not_found' };
    }

    const cached = await this.prisma.gameImage.findUnique({ where: { query } });
    if (cached) {
      // 'blocked' 행은 캐시 사용 — 다음 크론에서 재시도되도록 둔다.
      // (런타임에서 다시 외부 호출해 봤자 같은 차단을 만날 가능성이 크다.)
      if (cached.status === 'blocked') {
        return { query, imageUrl: null, status: 'blocked' };
      }
      // Naver/not_found는 CSE가 켜져있으면 1회 업그레이드 시도.
      const upgradeable =
        cached.source === 'naver' &&
        cached.status === 'not_found' &&
        this.googleApi.isConfigured();
      if (!upgradeable) {
        return { query, imageUrl: cached.imageUrl, status: toStatus(cached.status) };
      }
    }

    // 동시 요청 dedup 키에는 verifyText까지 포함 — 같은 query/다른 verify는 결과가 다를 수 있음.
    const inflightKey = options?.verifyText ? `${query}::v=${options.verifyText}` : query;
    const existing = this.inflight.get(inflightKey);
    if (existing) return existing;

    const work = this.fetchAndCache(query, queryType, options);
    this.inflight.set(inflightKey, work);
    try {
      return await work;
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  private async fetchAndCache(
    query: string,
    queryType: ImageQueryType,
    options?: SearchOptions,
  ): Promise<GameImageResponse> {
    const chain: Array<{ provider: ImageProvider; active: boolean }> = [
      { provider: this.googleApi, active: this.googleApi.isConfigured() },
      { provider: this.naver, active: true },
    ];

    let result: ImageResult = { imageUrl: null, status: 'error' };
    let source = this.naver.source;

    for (const { provider, active } of chain) {
      if (!active) continue;
      result = await provider.search(query, options);
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
