export type ImageQueryType = 'game' | 'company';
export type ImageStatus = 'found' | 'not_found' | 'error';
export type JobSource = 'gamejob' | 'wanted';

export interface AlternateSource {
  source: JobSource;
  detailUrl: string;
}

export interface Job {
  id: string;
  source: JobSource;
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
  alternateSources: AlternateSource[]; // dedup 시 흡수된 다른 소스의 동일 공고들
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
  failedSources?: JobSource[]; // 일부 소스 실패 시 메타로 노출
}

export interface GameImageResponse {
  query: string;
  imageUrl: string | null;
  status: ImageStatus;
}

/** GET /api/job-images?id=<id> 응답. 상세페이지 enrichment를 한 번에 묶어 반환. */
export interface JobImagesResponse {
  /** 우선순위 순으로 합친 전체 이미지 URL 배열 (카루셀 카드 표면용). */
  images: string[];
  /** 게임 관련 이미지: 대표게임 네이버 검색 결과 + 브래킷 게임 네이버 결과 (모달 "게임" 탭). */
  gameImages: string[];
  /** GameJob 상세페이지의 회사 사진 (모달 "회사" 탭). */
  companyPhotos: string[];
  companyLogoUrl: string | null;
  representativeGames: string[];
}
