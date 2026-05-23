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
 * Run locally:
 *   DATABASE_URL=postgresql://… pnpm --filter crawler crawl
 *
 * Run via GitHub Actions cron — see `.github/workflows/refresh-images.yml`.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { Client } from 'pg';

const MAX_QUERIES = Number(process.env.CRAWLER_MAX_QUERIES ?? '500');
const SLEEP_MIN_MS = Number(process.env.CRAWLER_SLEEP_MIN_MS ?? '5000');
const SLEEP_MAX_MS = Number(process.env.CRAWLER_SLEEP_MAX_MS ?? '10000');
const PAGE_TIMEOUT_MS = Number(process.env.CRAWLER_PAGE_TIMEOUT_MS ?? '15000');

interface GoogleResult {
  imageUrl: string | null;
  blocked: boolean;
}

async function gatherQueries(db: Client): Promise<string[]> {
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
  const seen = await db.query<{ query: string; source: string; status: string }>(
    `SELECT query, source, status FROM game_images WHERE query IN (${placeholders})`,
    Array.from(all),
  );
  const seenByQuery = new Map(seen.rows.map((r) => [r.query, r]));

  return Array.from(all).filter((q) => {
    const row = seenByQuery.get(q);
    if (!row) return true; // never tried
    // Already crawler-found by Google → done.
    if (row.source === 'google-crawler' && row.status === 'found') return false;
    // Crawler hit Google block last time → retry (per spec).
    if (row.source === 'google-crawler' && row.status === 'blocked') return true;
    // Naver not_found → upgrade attempt.
    if (row.source === 'naver' && row.status === 'not_found') return true;
    // Naver found and crawler hasn't tried → upgrade attempt.
    if (row.source === 'naver' && row.status === 'found') return true;
    return false;
  });
}

async function searchGoogle(
  context: BrowserContext,
  query: string,
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
    const imgUrl = await page.evaluate(() => {
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
          return src;
        }
      }
      return null;
    });
    return { imageUrl: imgUrl, blocked: false };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function searchNaver(query: string): Promise<string | null> {
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
  // The first plausible CDN image URL — Naver wraps results variably; cover common cases.
  const m =
    html.match(/"thumbUrl":"(https:[^"]+)"/) ??
    html.match(/data-source="(https:[^"]+)"/) ??
    html.match(/src="(https?:\/\/search\.pstatic\.net\/[^"]+)"/) ??
    html.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/i);
  if (!m) return null;
  let url = m[1].replace(/\\\//g, '/');
  if (url.startsWith('http://')) url = 'https://' + url.slice('http://'.length);
  return url;
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

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      try {
        const g = await searchGoogle(context, q);
        if (g.blocked) {
          // Mark blocked; then try Naver.
          await upsert(db, q, 'google-crawler', null, 'blocked');
          blockedCount++;
          const n = await searchNaver(q);
          if (n) {
            await upsert(db, q, 'naver', n, 'found');
            naverFoundCount++;
          } else {
            // Leave the blocked row as the latest record so the next crawl retries.
            emptyCount++;
          }
        } else if (g.imageUrl) {
          await upsert(db, q, 'google-crawler', g.imageUrl, 'found');
          okCount++;
        } else {
          await upsert(db, q, 'google-crawler', null, 'not_found');
          emptyCount++;
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
