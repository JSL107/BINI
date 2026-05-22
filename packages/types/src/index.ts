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
