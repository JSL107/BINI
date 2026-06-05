import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type {
  CareerSiteLink,
  CareerSitesResponse,
  CompanyDetailResponse,
  JobSource,
} from '@bini/types';
import { parseCareerSitesMarkdown } from './companies-parser';
import { BROWSER_UA } from '../scraper/http-constants';
import { PrismaService } from '../prisma/prisma.service';
import { toJobDto } from '../jobs/jobs-cron.service';

const README_URL =
  'https://raw.githubusercontent.com/GameForPeople/korea-game-career-site/master/README.md';
const SOURCE_ID = 'github:GameForPeople/korea-game-career-site+bini-extras';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PING_TIMEOUT_MS = 4_000;
const PING_CONCURRENCY = 30;

// BINI 자체 큐레이션 보강 목록. upstream README가 줄어들면서 빠진 회사 + 신규
// 발굴 회사. nest-cli.json assets 설정으로 dist/companies/ 하위에 복사된다.
const EXTRA_MD_PATH = join(__dirname, 'extra-career-sites.md');
let EXTRA_MARKDOWN = '';
try {
  EXTRA_MARKDOWN = readFileSync(EXTRA_MD_PATH, 'utf-8');
} catch {
  // 파일이 없어도 upstream만으로 동작. 에러는 service 생성 시점에 로그.
  EXTRA_MARKDOWN = '';
}

/**
 * URL을 dedupe 키로 정규화: 프로토콜/대소문자/끝 슬래시 차이를 흡수하고
 * host + pathname만 비교한다. www. 접두사는 제거. query/hash는 무시.
 */
export function canonicalUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * 두 CareerSiteLink 리스트를 URL 키 기준으로 dedupe. 같은 키가 있으면
 * 첫 번째(= upstream 우선) 항목을 유지.
 */
export function dedupeCareerSites(
  primary: readonly CareerSiteLink[],
  extra: readonly CareerSiteLink[],
): CareerSiteLink[] {
  const seen = new Set<string>();
  const out: CareerSiteLink[] = [];
  for (const site of [...primary, ...extra]) {
    const key = canonicalUrlKey(site.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(site);
  }
  return out;
}

function isSafeHostname(hostname: string): boolean {
  // IPv4 literal check
  const v4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
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
  private cached: { response: CareerSitesResponse; expiresAt: number } | null =
    null;
  private readonly extraSites: readonly CareerSiteLink[];

  constructor(private readonly prisma: PrismaService) {
    this.extraSites = EXTRA_MARKDOWN
      ? Object.freeze(parseCareerSitesMarkdown(EXTRA_MARKDOWN))
      : [];
    if (this.extraSites.length === 0 && EXTRA_MARKDOWN === '') {
      this.logger.warn(
        `extra-career-sites.md 로드 실패 — upstream만 사용 (path: ${EXTRA_MD_PATH})`,
      );
    } else {
      this.logger.log(`extra-career-sites 로드: ${this.extraSites.length}건`);
    }
  }

  /**
   * 한 회사의 BINI 통합 잡 + 회사 메타데이터(로고/사진/대표게임/소스/외부 채용 페이지).
   *
   * - 회사명은 정확 일치(case-insensitive). DB의 jobs.company는 사이트마다 표기
   *   미세 차이가 있을 수 있어 trim + 대소문자 무시 매칭.
   * - 만료 잡도 포함 (사용자가 직접 조회한 경우 과거 잡 조회 가치 있음).
   * - 회사 메타데이터는 잡들의 enrichment 결과 합집합으로 합성.
   */
  async getCompanyByName(
    rawName: string,
  ): Promise<CompanyDetailResponse | null> {
    const name = rawName.trim();
    if (!name) return null;
    const rows = await this.prisma.job.findMany({
      where: {
        company: { equals: name, mode: 'insensitive' as const },
      },
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) return null;

    const jobs = rows.map((row) => toJobDto(row));

    // 회사명 정규화 — 첫 잡의 표기 사용 (사용자가 검색한 형태와 다를 수 있음).
    const canonicalName = rows[0].company;

    // logoUrl: 첫 비-null
    const logoUrl =
      rows.find((r) => r.companyLogoUrl !== null && r.companyLogoUrl.length > 0)
        ?.companyLogoUrl ?? null;

    // photos / representativeGames: 합집합 dedup
    const photoSet = new Set<string>();
    const photos: string[] = [];
    for (const r of rows) {
      for (const p of r.companyPhotos) {
        if (!photoSet.has(p)) {
          photoSet.add(p);
          photos.push(p);
        }
      }
    }
    const gameSet = new Set<string>();
    const representativeGames: string[] = [];
    for (const r of rows) {
      for (const g of r.representativeGames) {
        if (!gameSet.has(g)) {
          gameSet.add(g);
          representativeGames.push(g);
        }
      }
    }

    // sources: unique
    const sourceSet = new Set<string>();
    const sources: JobSource[] = [];
    for (const j of jobs) {
      if (!sourceSet.has(j.source)) {
        sourceSet.add(j.source);
        sources.push(j.source);
      }
    }

    // externalCareerUrl: 첫 비-empty companyUrl
    const externalCareerUrl =
      rows.find((r) => r.companyUrl && r.companyUrl.length > 0)?.companyUrl ??
      null;

    // 잡플래닛 평판 캐시 — crawler가 채워두면 회사 페이지 우측 카드로 노출.
    // status='found' + rating 채워진 경우만 의미 있음.
    const jp = await this.prisma.jobplanetCompany.findFirst({
      where: {
        companyName: { equals: canonicalName, mode: 'insensitive' as const },
        status: 'found',
      },
    });
    // 외부 URL은 jobplanet 도메인만 허용해 javascript:/data: 같은 위험 스킴이
    // 응답에 새어 나가지 않게 한다 — 크롤러가 도메인 외 href를 잡는 변형이 생겨도
    // 응답 시점에 차단.
    const jpUrl = (() => {
      if (!jp?.companyUrl) return null;
      try {
        const u = new URL(jp.companyUrl);
        if (u.protocol !== 'https:') return null;
        if (!/(^|\.)jobplanet\.co\.kr$/i.test(u.hostname)) return null;
        return u.toString();
      } catch {
        return null;
      }
    })();

    return {
      name: canonicalName,
      logoUrl,
      photos,
      representativeGames,
      sources,
      externalCareerUrl,
      jobs,
      jobplanet: jp
        ? {
            url: jpUrl,
            rating: jp.rating,
            reviewCount: jp.reviewCount,
            salaryAvg: jp.salaryAvg,
            fetchedAt: jp.fetchedAt.toISOString(),
          }
        : null,
    };
  }

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
      const upstream = parseCareerSitesMarkdown(md);
      // upstream을 우선시하면서 BINI 보강 목록과 URL 기준 dedupe.
      const merged = dedupeCareerSites(upstream, this.extraSites);
      this.logger.log(
        `Career sites parsed: upstream ${upstream.length} + extras ${this.extraSites.length} → merged ${merged.length}건`,
      );
      return merged;
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
      const deadList = sites
        .filter((_, i) => !flags[i])
        .map((s) => `${s.name}=${s.url}`);
      this.logger.debug(`dead URLs: ${deadList.join(', ')}`);
      this.logger.log(
        `Career sites dead filter: ${dead}건 제외, ${alive.length}건 유지`,
      );
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
          if (
            next.hostname === u.hostname ||
            next.hostname === 'www.' + u.hostname
          ) {
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
