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
}

export interface ScrapeResult {
  jobs: RawJob[];
  totalPages: number;
}
