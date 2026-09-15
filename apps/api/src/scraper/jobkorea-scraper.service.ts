import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseJobkoreaList, parseJobkoreaTotalPages } from './jobkorea-parser';
import type { RawJob, ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 잡코리아 검색 질의. 선정 근거는 saramin-scraper.service.ts 의 SARAMIN_QUERIES 주석 참조. */
export const JOBKOREA_QUERIES: readonly string[] = [
  '게임 원화',
  '캐릭터 원화',
  '원화가',
];

@Injectable()
export class JobkoreaScraperService implements JobScraper {
  readonly source: JobSource = 'jobkorea';
  private readonly logger = new Logger(JobkoreaScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      JOBKOREA_QUERIES.map((query) => this.fetchQuery(query, page)),
    );

    const merged = new Map<string, RawJob>();
    let maxTotalPages = 0;
    let failed = 0;

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        failed += 1;
        this.logger.warn(
          `잡코리아 "${JOBKOREA_QUERIES[index]}" 실패: ${String(result.reason)}`,
        );
        continue;
      }
      maxTotalPages = Math.max(maxTotalPages, result.value.totalPages);
      for (const job of result.value.jobs) {
        if (!merged.has(job.sourceId)) merged.set(job.sourceId, job);
      }
    }

    if (failed === JOBKOREA_QUERIES.length) {
      throw new BadGatewayException('잡코리아 전 질의 요청 실패');
    }

    return { jobs: [...merged.values()], totalPages: maxTotalPages };
  }

  private async fetchQuery(
    query: string,
    page: number,
  ): Promise<{ jobs: RawJob[]; totalPages: number }> {
    const params = new URLSearchParams({
      stext: query,
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
    // 잡코리아도 client-side art filter라 페이지당 0건이 정상 — Wanted와 동일 정책.
    return {
      jobs: parseJobkoreaList(html),
      totalPages: parseJobkoreaTotalPages(html),
    };
  }
}
