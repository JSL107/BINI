import { Injectable, Logger } from '@nestjs/common';
import {
  parseJobBodyImages,
  parseJobDetail,
  type JobDetailExtract,
} from './gamejob-detail-parser';
import { BROWSER_UA } from './http-constants';

const EMPTY: JobDetailExtract = {
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
  bodyImages: [],
};

const FETCH_TIMEOUT_MS = 8_000;

@Injectable()
export class GamejobDetailService {
  private readonly logger = new Logger(GamejobDetailService.name);

  /**
   * Best-effort fetch of a GameJob job. Pulls TWO pages in parallel:
   *   1) `/Recruit/GI_Read/View?GI_No=<id>` — main detail page (logo, photos, 대표게임)
   *   2) `/Recruit/GI_Read_Comt_Ifrm?gno=<id>` — body iframe (company-uploaded ads/keyart)
   *
   * Never throws — any failure on either fetch returns its empty slice. The 8s
   * AbortSignal timeout prevents a slow GameJob response from holding the API
   * request indefinitely.
   */
  async fetchDetail(jobId: string): Promise<JobDetailExtract> {
    const [detail, bodyImages] = await Promise.all([
      this.fetchMain(jobId),
      this.fetchBodyImages(jobId),
    ]);
    return { ...detail, bodyImages };
  }

  private async fetchMain(jobId: string): Promise<JobDetailExtract> {
    const url = `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
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

  private async fetchBodyImages(jobId: string): Promise<string[]> {
    const url = `https://www.gamejob.co.kr/Recruit/GI_Read_Comt_Ifrm?gno=${encodeURIComponent(jobId)}&v1`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${encodeURIComponent(jobId)}`,
        },
      });
      if (!res.ok) {
        this.logger.warn(`body iframe HTTP ${res.status} for gno=${jobId}`);
        return [];
      }
      return parseJobBodyImages(await res.text());
    } catch (err) {
      this.logger.warn(`body iframe fetch error for gno=${jobId}: ${String(err)}`);
      return [];
    }
  }
}
