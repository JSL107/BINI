import { Injectable, Logger } from '@nestjs/common';
import { ImageProvider, ImageResult } from './image-provider';
import { createLimiter } from './limit';

/**
 * Google Custom Search JSON API 기반 이미지 검색.
 *
 * 활성화에는 두 환경변수가 필요:
 *   - GOOGLE_CSE_API_KEY: Google Cloud Console에서 발급한 API 키
 *   - GOOGLE_CSE_ID: programmablesearchengine.google.com에서 만든 검색엔진 ID (cx)
 *     ("Search the entire web" 모드 + 이미지 검색 활성화)
 *
 * 환경변수가 없으면 `isConfigured() === false`, 호출 시 error 상태를 반환해 caller가
 * Naver 폴백으로 넘어갈 수 있게 한다 (실제 호출은 미발생).
 *
 * 무료 quota: 100건/일. 초과분은 $5/1000건 (Google Cloud 결제 활성화 필요).
 * 이 시스템은 `game_images` 테이블에 캐시하므로 같은 검색어는 1회만 quota 소비.
 */
@Injectable()
export class GoogleImageService implements ImageProvider {
  readonly source = 'google';
  private readonly logger = new Logger(GoogleImageService.name);
  private readonly limit = createLimiter(5);

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID);
  }

  search(query: string): Promise<ImageResult> {
    return this.limit(() => this.doSearch(query));
  }

  private async doSearch(query: string): Promise<ImageResult> {
    const key = process.env.GOOGLE_CSE_API_KEY;
    const cx = process.env.GOOGLE_CSE_ID;
    if (!key || !cx) {
      return { imageUrl: null, status: 'error' };
    }
    try {
      const url =
        'https://www.googleapis.com/customsearch/v1' +
        `?q=${encodeURIComponent(query)}` +
        `&searchType=image&cx=${encodeURIComponent(cx)}&key=${encodeURIComponent(key)}` +
        '&num=1&safe=active&gl=kr&hl=ko';
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) {
        // 429(quota 초과)는 흔한 일이므로 warn 한 줄.
        this.logger.warn(
          `Google CSE HTTP ${res.status} for "${query}" — falling back`,
        );
        return { imageUrl: null, status: 'error' };
      }
      const data: { items?: Array<{ link?: string }> } = await res.json();
      const imageUrl = data?.items?.[0]?.link ?? null;
      return imageUrl
        ? { imageUrl, status: 'found' }
        : { imageUrl: null, status: 'not_found' };
    } catch (err) {
      this.logger.warn(`Google CSE error: ${String(err)}`);
      return { imageUrl: null, status: 'error' };
    }
  }
}
