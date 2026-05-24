/**
 * Saramin detail enrichment crawler.
 *
 * 사라민 상세 페이지는 SSR 데이터(__NEXT_DATA__ 등)가 없고 본문이 JS 렌더링
 * 후에야 노출돼서 정적 fetch로는 회사 로고/사진을 잡을 수 없다. 따라서 이
 * 어댑터는 `apps/crawler`(headless Chromium)에 살린다 — Vercel api 번들에는
 * Playwright가 들어가지 않는다.
 *
 * 절차:
 *   1) DB에서 `source='saramin' AND expiredAt IS NULL AND
 *      (detailScrapedAt IS NULL OR detailScrapedAt < now - 1d)` 잡 select.
 *      `detailScrapedAt asc nulls first, registeredAt desc`로 정렬.
 *   2) 잡당 Playwright로 detail URL을 열고 `networkidle`까지 대기.
 *   3) 페이지 안의 사라민 호스트 이미지(`saraminimage.co.kr`, `file.saramin.co.kr`)
 *      를 size + position 정보와 함께 수집.
 *   4) 휴리스틱 분류:
 *      - 너비/높이 < 80px → 픽셀·아이콘으로 보고 skip
 *      - 너비 < 240 AND 높이 < 240 AND 정사각형에 가까움 → 회사 로고 후보 (첫 항목)
 *      - 그 외 → bodyImages
 *   5) jobs row에 companyLogoUrl + bodyImages + detailScrapedAt 갱신.
 *   6) 잡당 5-9s jitter sleep로 사라민에 burst 없도록.
 *
 * Run:
 *   DATABASE_URL=postgresql://… pnpm --filter crawler crawl:saramin
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { Client } from 'pg';

const MAX_TARGETS = Number(process.env.SARAMIN_MAX_TARGETS ?? '50');
const SLEEP_MIN_MS = Number(process.env.SARAMIN_SLEEP_MIN_MS ?? '5000');
const SLEEP_MAX_MS = Number(process.env.SARAMIN_SLEEP_MAX_MS ?? '9000');
const PAGE_TIMEOUT_MS = Number(process.env.SARAMIN_PAGE_TIMEOUT_MS ?? '20000');
const STALE_AGE_MS = 24 * 60 * 60 * 1000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Target {
  id: string;
  sourceId: string;
}

interface ImageInfo {
  url: string;
  width: number;
  height: number;
  top: number;
}

async function gatherTargets(db: Client): Promise<Target[]> {
  const cutoff = new Date(Date.now() - STALE_AGE_MS);
  const rows = await db.query<{ id: string; sourceId: string }>(
    `
    SELECT id, "sourceId"
    FROM jobs
    WHERE source = 'saramin'
      AND "expiredAt" IS NULL
      AND ("detailScrapedAt" IS NULL OR "detailScrapedAt" < $1)
    ORDER BY "detailScrapedAt" ASC NULLS FIRST, "registeredAt" DESC
    LIMIT $2
    `,
    [cutoff, MAX_TARGETS],
  );
  return rows.rows;
}

async function extractImages(
  context: BrowserContext,
  jobId: string,
): Promise<ImageInfo[]> {
  const url = `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${encodeURIComponent(jobId)}`;
  const page = await context.newPage();
  try {
    await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // 본문 컴포넌트가 JS로 마운트될 시간을 확보. networkidle은 사라민에서 너무
    // 오래 걸려서 5초 컷 후 빠져나간다.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    return await page.evaluate(() => {
      const out: { url: string; width: number; height: number; top: number }[] = [];
      const seen = new Set<string>();
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
      for (const img of imgs) {
        const rawSrc = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
        let src = rawSrc;
        if (src.startsWith('//')) src = 'https:' + src;
        if (src.startsWith('http://')) src = 'https://' + src.slice('http://'.length);
        if (!src.startsWith('https://')) continue;
        // 사라민 호스트만 — 외부 광고/공유 이미지는 회사 정보 아님.
        if (!/(saraminimage\.co\.kr|file\.saramin\.co\.kr)/i.test(src)) continue;
        // 트래커/공유 디폴트 컷.
        if (/share_default|gtag|gtm|criteo|doubleclick/i.test(src)) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        const rect = img.getBoundingClientRect();
        out.push({
          url: src,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top + window.scrollY),
        });
      }
      return out;
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

interface Classified {
  companyLogoUrl: string | null;
  bodyImages: string[];
}

function classify(images: ImageInfo[]): Classified {
  // 너비/높이 < 80px은 픽셀/아이콘으로 컷.
  const visible = images.filter((i) => i.width >= 80 && i.height >= 80);
  if (visible.length === 0) return { companyLogoUrl: null, bodyImages: [] };

  // 회사 로고: 페이지 최상단(top<400)에 있는, 정사각형에 가까운 작은 이미지.
  let companyLogoUrl: string | null = null;
  for (const i of visible) {
    if (companyLogoUrl) break;
    if (i.top >= 400) continue;
    if (i.width > 240 || i.height > 240) continue;
    const ratio = i.width / Math.max(1, i.height);
    if (ratio < 0.6 || ratio > 1.7) continue;
    companyLogoUrl = i.url;
  }

  // 나머지 → 위에서부터(top asc) bodyImages.
  const bodyImages: string[] = [];
  const sorted = [...visible].sort((a, b) => a.top - b.top);
  for (const i of sorted) {
    if (i.url === companyLogoUrl) continue;
    if (bodyImages.includes(i.url)) continue;
    bodyImages.push(i.url);
  }
  return { companyLogoUrl, bodyImages };
}

async function upsertJob(
  db: Client,
  id: string,
  companyLogoUrl: string | null,
  bodyImages: string[],
): Promise<void> {
  await db.query(
    `
    UPDATE jobs
    SET "companyLogoUrl" = $2,
        "bodyImages" = $3::text[],
        "companyPhotos" = ARRAY[]::text[],
        "representativeGames" = ARRAY[]::text[],
        "detailScrapedAt" = now()
    WHERE id = $1
    `,
    [id, companyLogoUrl, bodyImages],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(min: number, max: number): number {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = new Client({ connectionString: url });
  await db.connect();
  console.log('[db] connected');

  let browser: Browser | null = null;
  try {
    const targets = await gatherTargets(db);
    console.log(`[plan] ${targets.length} saramin jobs to enrich (cap ${MAX_TARGETS})`);
    if (targets.length === 0) {
      console.log('[done] nothing to do');
      return;
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: UA,
      locale: 'ko-KR',
      viewport: { width: 1366, height: 900 },
    });

    let updated = 0;
    let withImages = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const images = await extractImages(context, t.sourceId);
        const { companyLogoUrl, bodyImages } = classify(images);
        await upsertJob(db, t.id, companyLogoUrl, bodyImages);
        updated++;
        if (companyLogoUrl || bodyImages.length > 0) withImages++;
      } catch (e) {
        failed++;
        console.error(`[err] ${t.id}: ${String(e).slice(0, 140)}`);
      }
      if (i + 1 < targets.length) {
        const ms = jitter(SLEEP_MIN_MS, SLEEP_MAX_MS);
        console.log(
          `[${i + 1}/${targets.length}] ${t.id} — sleep ${ms}ms`,
        );
        await sleep(ms);
      } else {
        console.log(`[${i + 1}/${targets.length}] ${t.id}`);
      }
    }
    console.log(
      `[done] updated=${updated} withImages=${withImages} failed=${failed}`,
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
