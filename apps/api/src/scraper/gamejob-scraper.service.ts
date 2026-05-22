import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { parseJobList, parseTotalPages, RawJob } from './gamejob-parser';

export interface ScrapeResult {
  jobs: RawJob[];
  totalPages: number;
}

const LIST_URL = 'https://www.gamejob.co.kr/Recruit/_GI_Job_List/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

@Injectable()
export class GamejobScraperService {
  private readonly logger = new Logger(GamejobScraperService.name);

  /** 원화 직종 목록의 지정 페이지를 등록일순으로 스크래핑한다. */
  async fetchJobList(page: number): Promise<ScrapeResult> {
    const body = new URLSearchParams({
      'condition[duty]': '5',
      'condition[menucode]': '',
      'condition[tabcode]': '1',
      page: String(page),
      direct: '0',
      order: '3',
      pagesize: '40',
      tabcode: '1',
    }).toString();

    let res: Response;
    try {
      res = await fetch(LIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`게임잡 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`게임잡 요청 실패: HTTP ${res.status}`);
    }
    const html = await res.text();
    const jobs = parseJobList(html);
    if (jobs.length === 0) {
      throw new BadGatewayException(
        '게임잡 공고 파싱 결과가 0건입니다 (구조 변경 의심).',
      );
    }
    return { jobs, totalPages: parseTotalPages(html) };
  }
}
