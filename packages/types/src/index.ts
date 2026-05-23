export type ImageQueryType = 'game' | 'company';
export type ImageStatus = 'found' | 'not_found' | 'error';

export interface Job {
  id: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAt: string; // ISO 8601
  tags: string[];
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
  /** GameJob 상세페이지에서 lazy 채워지는 회사 로고 URL. 미스크랩이면 null. */
  companyLogoUrl: string | null;
  /** GameJob 상세페이지의 회사 사진들(최대 4장). 미스크랩이면 빈 배열. */
  companyPhotos: string[];
  /** GameJob 상세페이지의 "대표게임" 리스트. 미스크랩이거나 회사가 "-"로 비워두면 빈 배열. */
  representativeGames: string[];
}

export interface JobsResponse {
  page: number;
  totalPages: number;
  jobs: Job[];
}

export interface GameImageResponse {
  query: string;
  imageUrl: string | null;
  status: ImageStatus;
}

/** GET /api/job-images?id=<GI_No> 응답. 상세페이지 enrichment를 한 번에 묶어 반환. */
export interface JobImagesResponse {
  /** 카루셀 슬라이드용 이미지 URL 배열 (현재 단계: GameJob 회사 사진). */
  images: string[];
  companyLogoUrl: string | null;
  representativeGames: string[];
}
