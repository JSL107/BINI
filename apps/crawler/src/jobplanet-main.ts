/**
 * 잡플래닛 회사 평판 크롤러 — `jobs.company`에 나오는 모든 회사명에 대해
 * 잡플래닛 검색 → 첫 회사 결과 페이지로 이동 → 평점/리뷰 수/평균연봉을 추출하고
 * `jobplanet_companies` 캐시 테이블에 upsert.
 *
 * Architecture: `apps/api`가 아니라 여기 (`apps/crawler`)에 있어야 Vercel 번들에
 * Playwright가 포함되지 않는다.
 *
 * Politeness: 8-15s 지터링 sleep. 순차 처리. 잡플래닛은 잡사이트보다 봇 감지가
 * 엄격할 수 있어 namuwiki(4-8s)보다 보수적으로 잡았다.
 *
 * 갱신 정책 (gatherTargets 안에서):
 *   - 한 번도 시도 안 한 회사명 → 시도
 *   - 직전 결과가 'blocked' → 재시도 (일시적 가능성)
 *   - 직전 결과가 'not_found' → 14일 지났으면 재시도 (회사가 새로 등록됐을 수도)
 *   - 직전 결과가 'found' → 30일 지났으면 재시도 (평점 갱신)
 *
 * Run locally:
 *   DATABASE_URL=postgresql://… pnpm --filter crawler crawl:jobplanet
 *
 * Run via GitHub Actions cron — see `.github/workflows/refresh-jobplanet.yml`.
 */

import { chromium, type Browser } from 'playwright';
import { Client } from 'pg';
import { fetchJobplanetCompany } from './jobplanet.js';

const MAX_TARGETS = Number(process.env.JOBPLANET_MAX_TARGETS ?? '200');
const SLEEP_MIN_MS = Number(process.env.JOBPLANET_SLEEP_MIN_MS ?? '8000');
const SLEEP_MAX_MS = Number(process.env.JOBPLANET_SLEEP_MAX_MS ?? '15000');

const FOUND_TTL_DAYS = 30;
const NOT_FOUND_TTL_DAYS = 14;
// blocked는 일시적 가능성이 있지만 연속 차단 시 매일 같은 회사를 다시 때리면 차단이
// 강화될 수 있어 짧은 backoff를 둔다. 3일 안에 풀리면 다음 사이클이 자연스레 처리.
const BLOCKED_TTL_DAYS = 3;

async function gatherTargets(db: Client): Promise<string[]> {
  // 활성 잡(만료되지 않은)의 회사만 대상. 만료 회사까지 다 도는 건 낭비.
  const rows = await db.query<{ company: string }>(`
    SELECT DISTINCT trim(company) AS company
    FROM jobs
    WHERE length(trim(company)) > 0 AND "expiredAt" IS NULL
  `);
  const names = new Set(rows.rows.map((r) => r.company));
  if (names.size === 0) return [];

  const placeholders = Array.from(names)
    .map((_, i) => `$${i + 1}`)
    .join(',');
  const seen = await db.query<{ companyName: string; status: string; fetchedAt: Date }>(
    `SELECT "companyName", status, "fetchedAt" FROM jobplanet_companies WHERE "companyName" IN (${placeholders})`,
    Array.from(names),
  );
  const seenBy = new Map(seen.rows.map((r) => [r.companyName, r]));
  const now = Date.now();
  const dayMs = 86_400_000;

  return Array.from(names).filter((name) => {
    const row = seenBy.get(name);
    if (!row) return true;
    const ageDays = (now - new Date(row.fetchedAt).getTime()) / dayMs;
    if (row.status === 'blocked') return ageDays > BLOCKED_TTL_DAYS;
    if (row.status === 'not_found') return ageDays > NOT_FOUND_TTL_DAYS;
    if (row.status === 'found') return ageDays > FOUND_TTL_DAYS;
    return false;
  });
}

async function upsert(
  db: Client,
  companyName: string,
  result: {
    companyUrl: string | null;
    rating: number | null;
    reviewCount: number | null;
    salaryAvg: number | null;
    status: 'found' | 'not_found' | 'blocked';
  },
): Promise<void> {
  await db.query(
    `
    INSERT INTO jobplanet_companies (
      "companyName", "companyUrl", rating, "reviewCount", "salaryAvg", status, "fetchedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT ("companyName") DO UPDATE SET
      "companyUrl" = EXCLUDED."companyUrl",
      rating = EXCLUDED.rating,
      "reviewCount" = EXCLUDED."reviewCount",
      "salaryAvg" = EXCLUDED."salaryAvg",
      status = EXCLUDED.status,
      "fetchedAt" = EXCLUDED."fetchedAt"
  `,
    [
      companyName,
      result.companyUrl,
      result.rating,
      result.reviewCount,
      result.salaryAvg,
      result.status,
    ],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(min: number, max: number): number {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = new Client({ connectionString: url });
  await db.connect();
  console.log('[db] connected');

  let browser: Browser | null = null;
  try {
    const targets = (await gatherTargets(db)).slice(0, MAX_TARGETS);
    console.log(`[plan] ${targets.length} company names to crawl (cap ${MAX_TARGETS})`);
    if (targets.length === 0) {
      console.log('[done] nothing to do');
      return;
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'ko-KR',
      viewport: { width: 1366, height: 900 },
      // 잡플래닛은 봇 트래픽에 민감 — 실제 한국어 브라우저처럼 보이게 한다.
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    let foundCount = 0;
    let notFoundCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const name = targets[i];
      try {
        const r = await fetchJobplanetCompany(context, name);
        await upsert(db, name, r);
        if (r.status === 'found') foundCount++;
        else if (r.status === 'blocked') blockedCount++;
        else notFoundCount++;
        console.log(
          `[${i + 1}/${targets.length}] ${name.slice(0, 40)} → ${r.status}` +
            (r.rating !== null ? ` (★${r.rating}` : '') +
            (r.reviewCount !== null ? `, ${r.reviewCount} reviews)` : r.rating !== null ? ')' : ''),
        );
      } catch (e) {
        console.error(`[err] ${name}: ${String(e).slice(0, 140)}`);
      }
      if (i + 1 < targets.length) {
        const ms = jitter(SLEEP_MIN_MS, SLEEP_MAX_MS);
        await sleep(ms);
      }
    }
    console.log(
      `[done] found=${foundCount} not_found=${notFoundCount} blocked=${blockedCount}`,
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
