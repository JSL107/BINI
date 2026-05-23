import { Injectable, Logger } from '@nestjs/common';
import { parseJobDetail, type JobDetailExtract } from './gamejob-detail-parser';

const EMPTY: JobDetailExtract = {
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
};

const FETCH_TIMEOUT_MS = 8_000;

@Injectable()
export class GamejobDetailService {
  private readonly logger = new Logger(GamejobDetailService.name);

  /**
   * Best-effort fetch of a GameJob job-detail page.
   *
   * Never throws — returns EMPTY on any HTTP failure, timeout, or exception.
   * The 8s timeout prevents a slow GameJob response from holding the API
   * request indefinitely.
   */
  async fetchDetail(jobId: string): Promise<JobDetailExtract> {
    const url = `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`detail HTTP ${res.status} for GI_No=${jobId}`);
        return EMPTY;
      }
      return parseJobDetail(await res.text());
    } catch (err) {
      this.logger.warn(`detail fetch error for GI_No=${jobId}: ${String(err)}`);
      return EMPTY;
    }
  }
}
