import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import * as iconv from 'iconv-lite';
import { parseIncruitList, parseIncruitTotalPages } from './incruit-parser';
import type { ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CATEGORY_URL = 'https://job.incruit.com/jobdb_list/searchjob.asp?ct=1&ty=3&cd=12690';

@Injectable()
export class IncruitScraperService implements JobScraper {
  readonly source: JobSource = 'incruit';
  private readonly logger = new Logger(IncruitScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const url = page > 1 ? `${CATEGORY_URL}&PageNo=${page}` : CATEGORY_URL;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`인크루트 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`인크루트 요청 실패: HTTP ${res.status}`);
    }
    // 인크루트는 EUC-KR로 응답 — UTF-8로 디코딩
    const buf = Buffer.from(await res.arrayBuffer());
    const html = iconv.decode(buf, 'euc-kr');
    const jobs = parseIncruitList(html);
    return { jobs, totalPages: parseIncruitTotalPages(html) };
  }
}
