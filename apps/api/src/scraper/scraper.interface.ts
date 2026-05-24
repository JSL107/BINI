import type { JobSource } from '@bini/types';
import type { ScrapeResult } from './raw-job';

export interface JobScraper {
  readonly source: JobSource;
  fetchJobList(page: number): Promise<ScrapeResult>;
}
