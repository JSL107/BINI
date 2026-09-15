/**
 * Image crawler — periodically harvests Google Image Search via headless Chromium
 * and upserts results into the `game_images` cache table.
 *
 * Architecture: lives OUTSIDE `apps/api` so Vercel never bundles Playwright. The
 * api runtime just reads from `game_images`.
 *
 * Block handling: Google aggressively rate-limits scraping. When the page is
 * redirected to `/sorry/` (captcha), the row is upserted as `status='blocked'`
 * with `source='google-crawler'` and the same query is then retried against
 * Naver. The retry is recorded with `source='naver'`. The api's cache layer
 * treats `blocked` as "retry on next crawler run".
 *
 * Politeness: 5-10s sleep between queries (jittered). Sequential.
 *
 * Retry policy lives in `crawl-policy.ts` (cooldown per last attempt). A run stops
 * itself after CRAWLER_TIME_BUDGET_MS so the later workflow steps still run; the
 * remaining queries are picked up next run (never-tried first).
 *
 * Run locally:
 *   DATABASE_URL=postgresql://… pnpm --filter crawler crawl
 *
 * Run via GitHub Actions cron — see `.github/workflows/refresh-images.yml`.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { Client } from 'pg';
import { planImageQueries, type ImageCacheRow, type ImageTarget } from './crawl-policy.js';

const MAX_QUERIES = Number(process.env.CRAWLER_MAX_QUERIES ?? '500');
const SLEEP_MIN_MS = Number(process.env.CRAWLER_SLEEP_MIN_MS ?? '5000');
const SLEEP_MAX_MS = Number(process.env.CRAWLER_SLEEP_MAX_MS ?? '10000');
const PAGE_TIMEOUT_MS = Number(process.env.CRAWLER_PAGE_TIMEOUT_MS ?? '15000');
const TIME_BUDGET_MS = Number(process.env.CRAWLER_TIME_BUDGET_MS ?? String(15 * 60_000));

interface GoogleResult {
  imageUrl: string | null;
  blocked: boolean;
}

async function loadBadImageUrls(db: Client): Promise<Set<string>> {
  const rows = await db.query<{ imageUrl: string }>(
    `SELECT DISTINCT "imageUrl" FROM bad_image_reports`,
  );
  return new Set(rows.rows.map((r) => r.imageUrl));
}

async function gatherQueries(db: Client): Promise<ImageTarget[]> {
  const a = await db.query<{ q: string }>(`
    SELECT DISTINCT "imageQuery" AS q
    FROM jobs
    WHERE "imageQueryType" = 'game' AND length("imageQuery") > 0
  `);
  const b = await db.query<{ q: string }>(`
    SELECT DISTINCT (trim(name) || ' 게임') AS q
    FROM jobs, UNNEST("representativeGames") AS name
    WHERE length(trim(name)) > 0
  `);
  const all = new Set<string>();
  for (const r of [...a.rows, ...b.rows]) all.add(r.q);
  if (all.size === 0) return [];

  const placeholders = Array.from(all).map((_, i) => `$${i + 1}`).join(',');
  const seen = await db.query<ImageCacheRow & { query: string }>(
    `SELECT query, source, status, "fetchedAt", "imageUrl" FROM game_images WHERE query IN (${placeholders})`,
    Array.from(all),
  );
  const seenByQuery = new Map(seen.rows.map((r) => [r.query, r]));
  return planImageQueries(Array.from(all), seenByQuery, Date.now());
}

async function searchGoogle(
  context: BrowserContext,
  query: string,
  blockedUrls: Set<string>,
): Promise<GoogleResult> {
  const page = await context.newPage();
  try {
    const url =
      'https://www.google.com/search?udm=2&hl=ko&q=' + encodeURIComponent(query);
    await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // Block detection: Google redirects bot traffic to /sorry/.
    if (page.url().includes('/sorry/')) {
      return { imageUrl: null, blocked: true };
    }
    await page
      .waitForSelector('img[src^="https://encrypted-tbn"], img[src^="https://lh"]', {
        timeout: 8_000,
      })
      .catch(() => undefined);
    // Double-check after wait — sometimes the redirect lands slightly later.
    if (page.url().includes('/sorry/')) {
      return { imageUrl: null, blocked: true };
    }
    // 후보 array를 그대로 가져와서, 사용자 신고된 URL은 skip하고 첫 합격품을 채택.
    // 단일 결과만 뽑을 때보다 자가학습 차단의 효과가 더 큼.
    const candidates = await page.evaluate(() => {
      const out: string[] = [];
      const cands = Array.from(document.querySelectorAll('img'));
      for (const img of cands) {
        const src = img.getAttribute('src') ?? img.getAttribute('data-src');
        if (!src) continue;
        if (
          src.startsWith('https://encrypted-tbn') ||
          src.startsWith('https://lh3.googleusercontent.com') ||
          src.startsWith('https://lh4.googleusercontent.com') ||
          src.startsWith('https://lh5.googleusercontent.com') ||
          src.startsWith('https://lh6.googleusercontent.com')
        ) {
          out.push(src);
        }
      }
      return out;
    });
    const accepted = candidates.find((u) => !blockedUrls.has(u)) ?? null;
    return { imageUrl: accepted, blocked: false };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function searchNaver(
  query: string,
  blockedUrls: Set<string>,
): Promise<string | null> {
  // Static HTML scrape — Naver image search results expose hotlinkable URLs.
  const res = await fetch(
    'https://search.naver.com/search.naver?where=image&query=' +
      encodeURIComponent(query),
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8_000),
    },
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const html = await res.text();
  // 후보 패턴들을 모두 모아 차단 URL은 skip하고 첫 합격품을 채택.
  // 네이버는 결과 wrapper가 들쭉날쭉해 4가지 패턴 다 시도한다 (모두 같은 결과 페이지 안).
  const patterns = [
    /"thumbUrl":"(https:[^"]+)"/g,
    /data-source="(https:[^"]+)"/g,
    /src="(https?:\/\/search\.pstatic\.net\/[^"]+)"/g,
    /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      let url = m[1].replace(/\\\//g, '/');
      if (url.startsWith('http://')) url = 'https://' + url.slice('http://'.length);
      if (blockedUrls.has(url)) continue;
      return url;
    }
  }
  return null;
}

async function upsert(
  db: Client,
  query: string,
  source: 'google-crawler' | 'naver',
  imageUrl: string | null,
  status: 'found' | 'not_found' | 'blocked',
): Promise<void> {
  await db.query(
    `
    INSERT INTO game_images (query, "queryType", "imageUrl", status, source, "fetchedAt")
    VALUES ($1, 'game', $2, $3, $4, now())
    ON CONFLICT (query) DO UPDATE SET
      "imageUrl" = EXCLUDED."imageUrl",
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      "fetchedAt" = EXCLUDED."fetchedAt"
  `,
    [query, imageUrl, status, source],
  );
}

/**
 * 이미지를 못 얻은 시도를 기록한다. 이미 이미지가 있는 행(네이버 결과의 구글 업그레이드 시도)은
 * 결과를 그대로 두고 재시도 시계(fetchedAt)만 갱신 — 실패한 업그레이드가 기존 이미지를 null로 덮지 않게.
 */
async function recordMiss(
  db: Client,
  target: ImageTarget,
  status: 'blocked' | 'not_found',
): Promise<void> {
  if (target.hasImage) {
    await db.query(`UPDATE game_images SET "fetchedAt" = now() WHERE query = $1`, [
      target.query,
    ]);
  } else {
    await upsert(db, target.query, 'google-crawler', null, status);
  }
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
    const queries = (await gatherQueries(db)).slice(0, MAX_QUERIES);
    console.log(`[plan] ${queries.length} queries to crawl (cap ${MAX_QUERIES})`);
    if (queries.length === 0) {
      console.log('[done] nothing to do');
      return;
    }

    // 사용자 신고된 URL — 새 후보 채택 시 skip해서 자가학습 차단 루프 완결.
    const blockedUrls = await loadBadImageUrls(db);
    console.log(`[plan] ${blockedUrls.size} URL(s) on report-bad blocklist`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'ko-KR',
      viewport: { width: 1366, height: 900 },
    });

    let okCount = 0;
    let blockedCount = 0;
    let naverFoundCount = 0;
    let emptyCount = 0;

    const startedAt = Date.now();
    for (let i = 0; i < queries.length; i++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        console.log(
          `[budget] time budget exhausted after ${i}/${queries.length} — rest deferred to next run`,
        );
        break;
      }
      const target = queries[i];
      const q = target.query;
      try {
        const g = await searchGoogle(context, q, blockedUrls);
        if (g.imageUrl) {
          await upsert(db, q, 'google-crawler', g.imageUrl, 'found');
          okCount++;
        } else {
          if (g.blocked) blockedCount++;
          // Naver fallback only when Google blocked us (unchanged).
          const n = g.blocked ? await searchNaver(q, blockedUrls) : null;
          if (n) {
            await upsert(db, q, 'naver', n, 'found');
            naverFoundCount++;
          } else {
            // blocked → retried after cooldown; not_found → final (see crawl-policy.ts).
            await recordMiss(db, target, g.blocked ? 'blocked' : 'not_found');
            emptyCount++;
          }
        }
      } catch (e) {
        console.error(`[err] ${q}: ${String(e).slice(0, 140)}`);
      }
      if (i + 1 < queries.length) {
        const ms = jitter(SLEEP_MIN_MS, SLEEP_MAX_MS);
        console.log(
          `[${i + 1}/${queries.length}] ${q.slice(0, 60)} — sleep ${ms}ms`,
        );
        await sleep(ms);
      } else {
        console.log(`[${i + 1}/${queries.length}] ${q.slice(0, 60)}`);
      }
    }
    console.log(
      `[done] google_found=${okCount} blocked=${blockedCount} naver_fallback_found=${naverFoundCount} empty=${emptyCount}`,
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
