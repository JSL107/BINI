/**
 * 잡플래닛 회사 평판 추출. 회사명으로 검색 → 첫 결과 회사 페이지로 이동 →
 * 별점 / 리뷰 수 / 평균연봉(가능하면) 추출.
 *
 * 잡플래닛은 SPA + 로그인 게이트가 있어 일부 데이터(연봉 등)는 비로그인으로
 * 안 보일 수 있다. 평점·리뷰 수는 보통 공개. 본 크롤러는 로그인 없이 추출
 * 가능한 값만 모은다 — 없으면 null. status는 추출 가능 여부만 본다(rating이
 * 채워지면 'found').
 *
 * 차단 감지: jobplanet도 봇 트래픽에 captcha/차단 페이지를 띄울 수 있다.
 * 최종 URL이 차단성 키워드를 포함하거나, 검색 결과 셀렉터가 끝까지 안 잡히면
 * 'blocked'/'not_found'로 분류.
 */

import type { BrowserContext } from 'playwright';

export interface JobplanetResult {
  companyUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  salaryAvg: number | null;
  status: 'found' | 'not_found' | 'blocked';
}

const PAGE_TIMEOUT_MS = 20_000;
const BLOCKED_URL_RE = /\/(?:captcha|sorry|blocked|robot|forbidden)/i;

const EMPTY: Omit<JobplanetResult, 'status'> = {
  companyUrl: null,
  rating: null,
  reviewCount: null,
  salaryAvg: null,
};

export async function fetchJobplanetCompany(
  context: BrowserContext,
  companyName: string,
): Promise<JobplanetResult> {
  const page = await context.newPage();
  try {
    // 1) 검색
    const searchUrl =
      'https://www.jobplanet.co.kr/search?query_type=company&query=' +
      encodeURIComponent(companyName);
    const searchRes = await page
      .goto(searchUrl, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
      .catch(() => null);
    if (!searchRes) return { ...EMPTY, status: 'blocked' };

    if (BLOCKED_URL_RE.test(page.url())) {
      return { ...EMPTY, status: 'blocked' };
    }

    // 검색 결과의 첫 회사 카드 link. 잡플래닛 마크업은 자주 바뀌므로 후보 셀렉터
    // 여러 개를 시도한다.
    await page
      .waitForSelector('a[href*="/companies/"]', { timeout: 8_000 })
      .catch(() => undefined);
    const firstCompanyHref = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/companies/"]'),
      );
      for (const a of candidates) {
        const href = a.getAttribute('href');
        // /companies/12345 형태(detail) 만 받는다 — /companies?query=... 같은 검색 링크 제외.
        if (href && /\/companies\/[0-9]+(?:[/?]|$)/.test(href)) {
          return href;
        }
      }
      return null;
    });
    if (!firstCompanyHref) return { ...EMPTY, status: 'not_found' };

    // protocol-relative("//m.jobplanet.co.kr/..."), 절대, 상대 모두 안전하게 resolve.
    let companyUrl: string;
    try {
      companyUrl = new URL(firstCompanyHref, 'https://www.jobplanet.co.kr').toString();
    } catch {
      return { ...EMPTY, status: 'not_found' };
    }
    // jobplanet 도메인 밖으로 새는 변형이 생기면 not_found 처리.
    try {
      const host = new URL(companyUrl).hostname;
      if (!/(^|\.)jobplanet\.co\.kr$/i.test(host)) {
        return { ...EMPTY, status: 'not_found' };
      }
    } catch {
      return { ...EMPTY, status: 'not_found' };
    }

    // 2) 회사 페이지로 이동
    const companyRes = await page
      .goto(companyUrl, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
      .catch(() => null);
    if (!companyRes) return { companyUrl, rating: null, reviewCount: null, salaryAvg: null, status: 'blocked' };
    if (BLOCKED_URL_RE.test(page.url())) {
      return { companyUrl, rating: null, reviewCount: null, salaryAvg: null, status: 'blocked' };
    }

    // SPA route — 평점 노드가 lazy-load일 수 있어 잠깐 대기.
    await page
      .waitForSelector(
        '.rate_box, .rate_value, [class*="rate_num"], [class*="rating_num"], [class*="rating_value"]',
        { timeout: 5_000 },
      )
      .catch(() => undefined);

    // 3) 본문에서 평점/리뷰/연봉 추출. 마크업 변동에 강건하도록 셀렉터 + 텍스트
    //    정규식 양쪽 모두 시도한다. 셀렉터 매칭도 합리범위(0.5~5.0) 통과 시에만 채택해
    //    분포 차트의 다른 숫자를 잘못 잡지 않도록 한다.
    const data = await page.evaluate(() => {
      function parseFloatSafe(s: string | null | undefined): number | null {
        if (!s) return null;
        const m = s.match(/[0-9]+(?:\.[0-9]+)?/);
        return m ? parseFloat(m[0]) : null;
      }
      function parseIntSafe(s: string | null | undefined): number | null {
        if (!s) return null;
        const m = s.replace(/,/g, '').match(/[0-9]+/);
        return m ? parseInt(m[0], 10) : null;
      }

      const body = document.body?.textContent ?? '';

      // Rating — 0.5~5.0 (잡플래닛 별점 노출 범위). 0이나 분포 카운트(1.0×N건 등)는 reject.
      let rating: number | null = null;
      const ratingSelectors = [
        '.rate_box .num',
        '.rate_value',
        '[class*="rate_num"]',
        '[class*="rating_num"]',
        '[class*="rating_value"]',
      ];
      for (const sel of ratingSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const v = parseFloatSafe(el.textContent);
          if (v !== null && v >= 0.5 && v <= 5.0) {
            rating = v;
            break;
          }
        }
        if (rating !== null) break;
      }
      if (rating === null) {
        const m = body.match(/(?:전체평점|총평점|기업평점)\s*([0-5](?:\.[0-9]+)?)/);
        const v = m ? parseFloat(m[1]) : null;
        if (v !== null && v >= 0.5 && v <= 5.0) rating = v;
      }
      if (rating !== null) {
        rating = Math.round(rating * 10) / 10;
      }

      // Review count — "1,234개의 기업리뷰" 같은 텍스트가 가장 안정적. 0 또는 음수 제외.
      let reviewCount: number | null = null;
      const reviewMatch = body.match(/([0-9,]{1,7})\s*개의?\s*(?:기업)?리뷰/);
      if (reviewMatch) {
        const v = parseIntSafe(reviewMatch[1]);
        if (v !== null && v > 0 && v < 10_000_000) reviewCount = v;
      }

      // Salary avg (만원). 비로그인 페이지에선 마스킹된 경우 많음 — 잡으면 보너스.
      // 합리범위(1,000만원 ~ 99,999만원)만 채택해 footer/광고의 무관한 숫자 컷.
      let salaryAvg: number | null = null;
      const salaryMatch = body.match(/평균\s*연봉[^0-9]{0,20}([0-9,]{2,6})\s*만\s*원/);
      if (salaryMatch) {
        const v = parseIntSafe(salaryMatch[1]);
        if (v !== null && v >= 1_000 && v < 100_000) salaryAvg = v;
      }

      return { rating, reviewCount, salaryAvg };
    });

    if (data.rating === null) {
      return { companyUrl, rating: null, reviewCount: null, salaryAvg: null, status: 'not_found' };
    }
    return {
      companyUrl,
      rating: data.rating,
      reviewCount: data.reviewCount,
      salaryAvg: data.salaryAvg,
      status: 'found',
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}
