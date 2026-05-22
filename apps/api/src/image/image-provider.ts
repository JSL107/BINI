import type { ImageStatus } from '@bini/types';

export interface ImageResult {
  imageUrl: string | null;
  status: ImageStatus;
}

export interface ImageProvider {
  readonly source: string;
  search(query: string): Promise<ImageResult>;
}
