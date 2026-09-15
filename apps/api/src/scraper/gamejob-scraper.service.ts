import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseJobList, parseTotalPages } from './gamejob-parser';
import type { RawJob, ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const LIST_URL = 'https://www.gamejob.co.kr/Recruit/_GI_Job_List/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 수집 대상 아트 직군. 5=원화 · 6=모델링 · 7=애니메이션 · 8=이펙트·FX.
 *
 * 게임잡은 21개 직군을 두고 있으나 아트 4개만 받는다. UI(4)·영상제작(11)·
 * 플랫폼 디자인(13)·BX(14)와 기획·개발·사운드 계열은 이번 범위 밖이다.
 *
 * 직군 코드는 "무엇을 요청할지"만 정한다. 저장되는 직군 라벨은 공고가 실제로 달고
 * 있는 값이다(gamejob-parser 의 extractOnclickJobFamilies) — duty=6 으로 받은 공고가
 * 원화도 달고 있으면 그 사실이 보존되어야 한다.
 */
export const ART_DUTY_CODES: readonly string[] = ['5', '6', '7', '8'];

@Injectable()
export class GamejobScraperService implements JobScraper {
  readonly source: JobSource = 'gamejob';
  private readonly logger = new Logger(GamejobScraperService.name);

  /** 아트 직군들의 지정 페이지를 등록일순으로 받아 GI_No 로 합친다. */
  async fetchJobList(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      ART_DUTY_CODES.map((duty) => this.fetchDuty(duty, page)),
    );

    const failed: string[] = [];
    const merged = new Map<string, RawJob>();
    let maxTotalPages = 0;

    settled.forEach((result, index) => {
      const duty = ART_DUTY_CODES[index];
      if (result.status === 'rejected') {
        failed.push(duty);
        this.logger.warn(`게임잡 duty=${duty} 실패: ${String(result.reason)}`);
        return;
      }
      maxTotalPages = Math.max(maxTotalPages, result.value.totalPages);
      for (const job of result.value.jobs) {
        // 같은 공고가 여러 직군에 등록돼 있으면 GI_No 가 같다. 직군 라벨은 공고 자신이
        // 들고 오므로 먼저 담긴 것을 그대로 둔다 — 덮어써도 같은 값이다.
        if (!merged.has(job.sourceId)) merged.set(job.sourceId, job);
      }
    });

    if (failed.length === ART_DUTY_CODES.length) {
      throw new BadGatewayException(
        `게임잡 전 직군 요청 실패 (duty: ${failed.join(', ')})`,
      );
    }

    const jobs = [...merged.values()];
    // 한 직군이 0건인 것은 정상일 수 있다(공고가 적은 직군). 전부 0건일 때만
    // 마크업 구조가 바뀐 것으로 본다.
    if (jobs.length === 0) {
      throw new BadGatewayException(
        '게임잡 공고 파싱 결과가 전 직군 0건입니다 (구조 변경 의심).',
      );
    }

    return { jobs, totalPages: maxTotalPages };
  }

  private async fetchDuty(
    duty: string,
    page: number,
  ): Promise<{ jobs: RawJob[]; totalPages: number }> {
    const body = new URLSearchParams({
      'condition[duty]': duty,
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
    return { jobs: parseJobList(html), totalPages: parseTotalPages(html) };
  }
}
