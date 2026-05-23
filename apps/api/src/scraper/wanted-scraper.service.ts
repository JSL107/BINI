import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseWantedList, parseWantedTotalPages } from './wanted-parser';
import type { ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PAGE_SIZE = 40;
const CATEGORY = 959;

@Injectable()
export class WantedScraperService implements JobScraper {
  readonly source: JobSource = 'wanted';
  private readonly logger = new Logger(WantedScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const url =
      `https://www.wanted.co.kr/api/v4/jobs?category_tags=${CATEGORY}` +
      `&country=kr&job_sort=job.latest_order&limit=${PAGE_SIZE}&offset=${offset}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`원티드 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`원티드 요청 실패: HTTP ${res.status}`);
    }
    const json = await res.text();
    const jobs = parseWantedList(json);
    // 원티드는 client-side art filter라 페이지당 0건이 정상이다 — 빈 결과를 에러로 보지 않는다.
    return { jobs, totalPages: parseWantedTotalPages(json) };
  }
}
