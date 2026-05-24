import { Injectable, Logger } from '@nestjs/common';
import type { CareerSiteLink, CareerSitesResponse } from '@bini/types';
import { parseCareerSitesMarkdown } from './companies-parser';
import { BROWSER_UA } from '../scraper/http-constants';

const README_URL =
  'https://raw.githubusercontent.com/GameForPeople/korea-game-career-site/master/README.md';
const SOURCE_ID = 'github:GameForPeople/korea-game-career-site';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PING_TIMEOUT_MS = 4_000;
const PING_CONCURRENCY = 30;

function isSafeHostname(hostname: string): boolean {
  // IPv4 literal check
  const v4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 10) return false;                          // 10.0.0.0/8
    if (a === 127) return false;                         // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return false;            // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return false;  // 172.16.0.0/12
    if (a === 192 && b === 168) return false;            // 192.168.0.0/16
    return true;
  }
  // IPv6 bracketed literal (e.g. [::1], [fc00::1])
  if (hostname.startsWith('[') && hostname.endsWith(']')) return false;
  // Hostname strings
  const low = hostname.toLowerCase();
  if (low === 'localhost') return false;
  if (low.endsWith('.local')) return false;
  if (low.endsWith('.internal')) return false;
  return true;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private cached: { response: CareerSitesResponse; expiresAt: number } | null = null;

  async getCareerSites(): Promise<CareerSitesResponse> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.response;

    const parsed = await this.fetchAndParse();
    const alive = await this.filterAlive(parsed);

    const response: CareerSitesResponse = {
      sites: alive,
      source: SOURCE_ID,
      fetchedAt: new Date(now).toISOString(),
    };

    // README 일시 장애 또는 전체 사이트 dead 판정 시 캐시에 빈 결과를 굳히지 않는다.
    // 기존 캐시가 있으면 grace TTL 동안 유지.
    if (alive.length === 0 && this.cached) {
      this.logger.warn('Career sites refresh가 빈 결과 — 기존 캐시 grace 유지');
      return this.cached.response;
    }
    if (alive.length === 0) {
      // 첫 시도에 빈 결과 → 캐시 굳히지 않음 (다음 요청 재시도)
      return response;
    }

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
      const deadList = sites.filter((_, i) => !flags[i]).map((s) => `${s.name}=${s.url}`);
      this.logger.debug(`dead URLs: ${deadList.join(', ')}`);
      this.logger.log(`Career sites dead filter: ${dead}건 제외, ${alive.length}건 유지`);
    }
    return [...alive];
  }

  private async pingAlive(url: string): Promise<boolean> {
    // http URL은 브라우저처럼 https로 자동 normalize해 시도 (사이트가 https 지원 시 alive).
    // 외부 README가 갱신 안 된 채 http만 적힌 케이스가 흔하다.
    const normalized = url.replace(/^http:\/\//i, 'https://');
    try {
      const u = new URL(normalized);
      if (u.protocol !== 'https:') return false;
      if (!isSafeHostname(u.hostname)) return false;

      const res = await fetch(normalized, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });

      // 3xx: 같은 호스트 안에서 메인 path로 redirect = 채용 운영 종료 시그널.
      // 채용 path를 유지하는 redirect(https 강제, www 표준화)는 alive로 인정.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return false;
        try {
          const next = new URL(loc, normalized);
          if (next.hostname === u.hostname || next.hostname === 'www.' + u.hostname) {
            const p = next.pathname.toLowerCase();
            const isMain =
              p === '' ||
              p === '/' ||
              p === '/index' ||
              p === '/index.html' ||
              p === '/main' ||
              p === '/home' ||
              p === '/recruit/' ||
              /^\/(error|404|notfound)/i.test(p);
            if (isMain) return false;
          }
        } catch {
          return false;
        }
        return true;
      }

      if (res.status < 200 || res.status >= 300) {
        void res.body?.cancel().catch(() => undefined);
        return false;
      }

      // 2xx — body 키워드 검사로 SPA 'not found' / 운영 종료 안내 페이지를 거른다.
      let html = '';
      try {
        html = (await res.text()).toLowerCase();
      } catch {
        return true; // body 못 읽어도 status 2xx면 alive 인정 (보수적)
      }
      const DEAD_PATTERNS = [
        'page not found',
        '찾을 수 없',
        '존재하지 않',
        '운영 종료',
        '서비스 종료',
        '지원이 종료',
        '채용이 종료',
        '채용을 종료',
        'service is not available',
        'service has ended',
        '404 error',
        'error 404',
      ];
      if (DEAD_PATTERNS.some((p) => html.includes(p))) return false;
      return true;
    } catch {
      return false;
    }
  }
}
