import { Injectable, Logger } from '@nestjs/common';
import type { CareerSiteLink, CareerSitesResponse } from '@bini/types';
import { parseCareerSitesMarkdown } from './companies-parser';

const README_URL =
  'https://raw.githubusercontent.com/GameForPeople/korea-game-career-site/master/README.md';
const SOURCE_ID = 'github:GameForPeople/korea-game-career-site';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PING_TIMEOUT_MS = 4_000;
const PING_CONCURRENCY = 30;
const PING_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private cached: { response: CareerSitesResponse; expiresAt: number } | null = null;

  async getCareerSites(): Promise<CareerSitesResponse> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.response;
    }
    const parsed = await this.fetchAndParse();
    const alive = await this.filterAlive(parsed);
    const response: CareerSitesResponse = {
      sites: alive,
      source: SOURCE_ID,
      fetchedAt: new Date(now).toISOString(),
    };
    this.cached = { response, expiresAt: now + CACHE_TTL_MS };
    return response;
  }

  private async fetchAndParse(): Promise<CareerSiteLink[]> {
    try {
      const res = await fetch(README_URL, {
        headers: { 'User-Agent': 'bini-companies/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`GitHub README fetch 실패: HTTP ${res.status}`);
        return [];
      }
      const md = await res.text();
      const sites = parseCareerSitesMarkdown(md);
      this.logger.log(`Career sites parsed: ${sites.length}건`);
      return sites;
    } catch (err) {
      this.logger.warn(`GitHub README fetch 예외: ${String(err)}`);
      return [];
    }
  }

  /**
   * 외부 README가 갱신되지 않은 채 운영 종료된 사이트(404/도메인 만료/5xx
   * 영구 장애)를 응답에서 제외. 4xx/5xx/timeout/DNS 실패는 모두 dead로 간주.
   *
   * 비용 제어: 동시 30개로 ping. 한 사이트 4s timeout. README 약 40개 기준
   * 최악 ~6s, 평균 1-2s. 결과는 CACHE_TTL_MS(24h) 동안 응답 캐시와 함께 보존.
   *
   * 봇 차단 회피: 일반 브라우저 UA + Accept 헤더. 헤드 메서드는 일부 사이트가
   * 405를 주므로 GET으로 시도하되 body는 읽지 않고 status만 본 뒤 abort.
   */
  private async filterAlive(
    sites: readonly CareerSiteLink[],
  ): Promise<CareerSiteLink[]> {
    const flags: boolean[] = new Array(sites.length).fill(false);
    for (let i = 0; i < sites.length; i += PING_CONCURRENCY) {
      const slice = sites.slice(i, i + PING_CONCURRENCY);
      const results = await Promise.all(
        slice.map((s) => this.pingAlive(s.url)),
      );
      for (let j = 0; j < results.length; j++) flags[i + j] = results[j];
    }
    const alive = sites.filter((_, i) => flags[i]);
    const dead = sites.length - alive.length;
    if (dead > 0) {
      this.logger.log(`Career sites dead filter: ${dead}건 제외, ${alive.length}건 유지`);
    }
    return [...alive];
  }

  private async pingAlive(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        headers: {
          'User-Agent': PING_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      // Body 읽지 않고 즉시 cancel — status만 확인.
      void res.body?.cancel().catch(() => undefined);
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    }
  }
}
