import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseSaraminList, parseSaraminTotalPages } from './saramin-parser';
import type { ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const QUERY = '게임 원화';

@Injectable()
export class SaraminScraperService implements JobScraper {
  readonly source: JobSource = 'saramin';
  private readonly logger = new Logger(SaraminScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const params = new URLSearchParams({
      searchType: 'search',
      searchword: QUERY,
      recruitPage: String(page),
    });
    const url = `https://www.saramin.co.kr/zf_user/search/recruit?${params.toString()}`;

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
      throw new BadGatewayException(`사람인 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`사람인 요청 실패: HTTP ${res.status}`);
    }
    const html = await res.text();
    const jobs = parseSaraminList(html);
    return { jobs, totalPages: parseSaraminTotalPages(html) };
  }
}
