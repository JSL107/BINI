import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseJobkoreaList, parseJobkoreaTotalPages } from './jobkorea-parser';
import type { ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const QUERY = '게임 원화';

@Injectable()
export class JobkoreaScraperService implements JobScraper {
  readonly source: JobSource = 'jobkorea';
  private readonly logger = new Logger(JobkoreaScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const params = new URLSearchParams({
      stext: QUERY,
      tabType: 'recruit',
      Page_No: String(page),
    });
    const url = `https://www.jobkorea.co.kr/Search/?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`잡코리아 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`잡코리아 요청 실패: HTTP ${res.status}`);
    }
    const html = await res.text();
    const jobs = parseJobkoreaList(html);
    // 잡코리아도 client-side art filter라 페이지당 0건이 정상 — Wanted와 동일 정책.
    return { jobs, totalPages: parseJobkoreaTotalPages(html) };
  }
}
