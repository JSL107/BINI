import { Injectable, Logger } from '@nestjs/common';
import { ImageProvider, ImageResult, SearchOptions } from './image-provider';
import {
  findVerifiedImageUrl,
  parseImageCandidates,
  parseFirstImageUrl,
} from './naver-image';
import { createLimiter } from './limit';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

@Injectable()
export class GameImageService implements ImageProvider {
  readonly source = 'naver';
  private readonly logger = new Logger(GameImageService.name);
  // 스펙 9절: 네이버 동시 스크래핑을 4개로 제한 (싱글턴 서비스의 모듈 단위 큐)
  private readonly limit = createLimiter(4);

  search(query: string, options?: SearchOptions): Promise<ImageResult> {
    return this.limit(() => this.doSearch(query, options));
  }

  private async doSearch(
    query: string,
    options?: SearchOptions,
  ): Promise<ImageResult> {
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
      const html = await res.text();

      // verifyText 없으면 기존 동작 — 첫 https 결과.
      if (!options?.verifyText) {
        const imageUrl = parseFirstImageUrl(html);
        return imageUrl
          ? { imageUrl, status: 'found' }
          : { imageUrl: null, status: 'not_found' };
      }

      // verifyText 있으면 출처 페이지 title 검증을 통과한 첫 결과만 채택.
      const candidates = parseImageCandidates(html);
      const verified = await findVerifiedImageUrl(candidates, options.verifyText);
      return verified
        ? { imageUrl: verified, status: 'found' }
        : { imageUrl: null, status: 'not_found' };
    } catch (err) {
      this.logger.warn(`네이버 이미지 검색 예외: ${String(err)}`);
      return { imageUrl: null, status: 'error' };
    }
  }
}
