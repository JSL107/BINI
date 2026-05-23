import type { ImageStatus } from '@bini/types';

export interface ImageResult {
  imageUrl: string | null;
  status: ImageStatus;
}

/**
 * 옵셔널 검색 옵션. `verifyText`가 있으면 provider는 검색결과의 출처 페이지
 * (`<title>` / `og:title`)에 해당 텍스트가 포함되는 결과만 채택해야 한다.
 * 검증을 지원하지 않는 provider는 옵션을 무시해도 된다 (기존 동작).
 */
export interface SearchOptions {
  verifyText?: string;
}

export interface ImageProvider {
  readonly source: string;
  search(query: string, options?: SearchOptions): Promise<ImageResult>;
}
