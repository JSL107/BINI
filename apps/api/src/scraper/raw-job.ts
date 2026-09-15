import type { JobSource } from '@bini/types';

export interface RawJob {
  source: JobSource;
  sourceId: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAtText: string;
  tags: string[];
  /**
   * 게시자가 공고에 단 직군 라벨(게임잡 원문). 예: ['원화', '애니메이션'].
   * 게임잡 외 소스는 이 정보를 목록에 주지 않으므로 빈 배열이다.
   */
  jobFamilies: string[];
}

export interface ScrapeResult {
  jobs: RawJob[];
  totalPages: number;
}
