import { Injectable, Logger } from '@nestjs/common';
import { ImageProvider, ImageResult } from './image-provider';
import { parseFirstImageUrl } from './naver-image';
import { createLimiter } from './limit';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

@Injectable()
export class GameImageService implements ImageProvider {
  readonly source = 'naver';
  private readonly logger = new Logger(GameImageService.name);
  // 스펙 9절: 네이버 동시 스크래핑을 4개로 제한 (싱글턴 서비스의 모듈 단위 큐)
  private readonly limit = createLimiter(4);

  search(query: string): Promise<ImageResult> {
    return this.limit(() => this.doSearch(query));
  }

  private async doSearch(query: string): Promise<ImageResult> {
    try {
      const url =
        'https://search.naver.com/search.naver?where=image&query=' +
        encodeURIComponent(query);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://www.naver.com/',
        },
      });
      if (!res.ok) {
        this.logger.warn(`네이버 이미지 검색 실패: HTTP ${res.status}`);
        return { imageUrl: null, status: 'error' };
      }
      const imageUrl = parseFirstImageUrl(await res.text());
      return imageUrl
        ? { imageUrl, status: 'found' }
        : { imageUrl: null, status: 'not_found' };
    } catch (err) {
      this.logger.warn(`네이버 이미지 검색 예외: ${String(err)}`);
      return { imageUrl: null, status: 'error' };
    }
  }
}
