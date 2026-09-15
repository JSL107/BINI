import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseSaraminList, parseSaraminTotalPages } from './saramin-parser';
import type { RawJob, ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 사람인 검색 질의. 카테고리(cat_kewd=1562, 원화) 전환은 기각했다 — 2026-09-15 실측에서
 * 카테고리 적합률 51% vs 키워드 72%. 게시자가 카테고리를 중복 선택할 수 있어 "부문별
 * 통합 채용" 공고가 모든 칸에 들어가고, 사람인의 "원화"는 게임 한정이 아니라 애니메이션
 * 원화(동화·채색)와 패션 소재 디자이너까지 포함한다.
 *
 * `컨셉 아티스트`·`게임 일러스트`는 각 35건 이상을 새로 물어오지만 마케팅·3D 모델러·
 * 편집 디자이너가 섞여 나왔고 개별 정확도를 재지 않았다. 축 A 필터를 한 회차 돌려
 * 실제 정화율을 본 뒤 추가를 판단한다.
 */
export const SARAMIN_QUERIES: readonly string[] = [
  '게임 원화',
  '캐릭터 원화',
  '원화가',
];

@Injectable()
export class SaraminScraperService implements JobScraper {
  readonly source: JobSource = 'saramin';
  private readonly logger = new Logger(SaraminScraperService.name);

  async fetchJobList(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      SARAMIN_QUERIES.map((query) => this.fetchQuery(query, page)),
    );

    const merged = new Map<string, RawJob>();
    let maxTotalPages = 0;
    let failed = 0;

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        failed += 1;
        this.logger.warn(
          `사람인 "${SARAMIN_QUERIES[index]}" 실패: ${String(result.reason)}`,
        );
        continue;
      }
      maxTotalPages = Math.max(maxTotalPages, result.value.totalPages);
      for (const job of result.value.jobs) {
        if (!merged.has(job.sourceId)) merged.set(job.sourceId, job);
      }
    }

    if (failed === SARAMIN_QUERIES.length) {
      throw new BadGatewayException('사람인 전 질의 요청 실패');
    }

    return { jobs: [...merged.values()], totalPages: maxTotalPages };
  }

  private async fetchQuery(
    query: string,
    page: number,
  ): Promise<{ jobs: RawJob[]; totalPages: number }> {
    const params = new URLSearchParams({
      searchType: 'search',
      searchword: query,
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
    return {
      jobs: parseSaraminList(html),
      totalPages: parseSaraminTotalPages(html),
    };
  }
}
