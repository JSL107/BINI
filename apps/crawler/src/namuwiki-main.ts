/**
 * 나무위키 이미지 크롤러 — `jobs.representativeGames`에 나오는 모든 게임명에 대해
 * 나무위키 페이지를 헤드리스 브라우저로 열어 대표 이미지를 추출하고
 * `namuwiki_images` 캐시 테이블에 upsert 한다.
 *
 * Architecture: `apps/api`가 아니라 여기 (`apps/crawler`)에 있어야 Vercel 번들에
 * Playwright가 포함되지 않는다.
 *
 * Politeness: 4-8s 지터링 sleep. 순차 처리. NAMUWIKI_TIME_BUDGET_MS가 지나면 스스로 멈춰
 * 워크플로 뒤 단계가 실행되게 한다 — 남은 대상은 다음 실행에서 처리.
 *
 * 갱신 정책 (gatherTargets 안에서):
 *   - 한 번도 시도 안 한 게임명 → 시도
 *   - 직전 결과가 'blocked' → 3일 지났으면 재시도 (차단은 일시적 가능성, 매 실행 두드리진 않음)
 *   - 직전 결과가 'not_found' → 7일 지났으면 재시도 (페이지가 새로 생겼을 수도)
 *   - 직전 결과가 'found' → 30일 지났으면 재시도 (이미지 변경 가능)
 *
 * Run locally:
 *   DATABASE_URL=postgresql://… pnpm --filter crawler crawl:namuwiki
 *
 * Run via GitHub Actions cron — see `.github/workflows/refresh-images.yml`.
 */

import { chromium, type Browser } from 'playwright';
import { Client } from 'pg';
import { shouldCrawlNamuwiki } from './crawl-policy.js';
import { fetchNamuwikiImage } from './namuwiki.js';

const MAX_TARGETS = Number(process.env.NAMUWIKI_MAX_TARGETS ?? '300');
const SLEEP_MIN_MS = Number(process.env.NAMUWIKI_SLEEP_MIN_MS ?? '4000');
const SLEEP_MAX_MS = Number(process.env.NAMUWIKI_SLEEP_MAX_MS ?? '8000');
const TIME_BUDGET_MS = Number(process.env.NAMUWIKI_TIME_BUDGET_MS ?? String(10 * 60_000));

async function gatherTargets(db: Client): Promise<string[]> {
  const games = await db.query<{ name: string }>(`
    SELECT DISTINCT trim(name) AS name
    FROM jobs, UNNEST("representativeGames") AS name
    WHERE length(trim(name)) > 0
  `);
  const names = new Set(games.rows.map((r) => r.name));
  if (names.size === 0) return [];

  const placeholders = Array.from(names).map((_, i) => `$${i + 1}`).join(',');
  const seen = await db.query<{ gameName: string; status: string; fetchedAt: Date }>(
    `SELECT "gameName", status, "fetchedAt" FROM namuwiki_images WHERE "gameName" IN (${placeholders})`,
    Array.from(names),
  );
  const seenBy = new Map(seen.rows.map((r) => [r.gameName, r]));
  const now = Date.now();
  return Array.from(names).filter((name) => shouldCrawlNamuwiki(seenBy.get(name), now));
}

async function upsert(
  db: Client,
  gameName: string,
  imageUrl: string | null,
  status: 'found' | 'not_found' | 'blocked',
): Promise<void> {
  await db.query(
    `
    INSERT INTO namuwiki_images ("gameName", "imageUrl", status, "fetchedAt")
    VALUES ($1, $2, $3, now())
    ON CONFLICT ("gameName") DO UPDATE SET
      "imageUrl" = EXCLUDED."imageUrl",
      status = EXCLUDED.status,
      "fetchedAt" = EXCLUDED."fetchedAt"
  `,
    [gameName, imageUrl, status],
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
    console.log(`[plan] ${targets.length} game names to crawl (cap ${MAX_TARGETS})`);
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
    });

    let foundCount = 0;
    let notFoundCount = 0;
    let blockedCount = 0;

    const startedAt = Date.now();
    for (let i = 0; i < targets.length; i++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        console.log(
          `[budget] time budget exhausted after ${i}/${targets.length} — rest deferred to next run`,
        );
        break;
      }
      const name = targets[i];
      try {
        const r = await fetchNamuwikiImage(context, name);
        await upsert(db, name, r.imageUrl, r.status);
        if (r.status === 'found') foundCount++;
        else if (r.status === 'blocked') blockedCount++;
        else notFoundCount++;
      } catch (e) {
        console.error(`[err] ${name}: ${String(e).slice(0, 140)}`);
      }
      if (i + 1 < targets.length) {
        const ms = jitter(SLEEP_MIN_MS, SLEEP_MAX_MS);
        console.log(
          `[${i + 1}/${targets.length}] ${name.slice(0, 40)} — sleep ${ms}ms`,
        );
        await sleep(ms);
      } else {
        console.log(`[${i + 1}/${targets.length}] ${name.slice(0, 40)}`);
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
