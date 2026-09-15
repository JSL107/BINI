/**
 * 크롤 대상 선정 규칙 — `index.ts`(game_images)와 `namuwiki-main.ts`(namuwiki_images)가 쓰는 순수 함수.
 *
 * 재시도는 항상 마지막 시도 시각(`fetchedAt`) 기준 쿨다운을 둔다. 쿨다운 없이 'blocked'나
 * 네이버 결과를 매 실행 재시도하면, GitHub Actions IP가 구글에 막혀 있는 동안 대기열이
 * 줄지 않아 매 실행이 timeout으로 끝나고 뒤 단계(namuwiki·saramin·expire)가 실행되지 않는다.
 */

const DAY_MS = 86_400_000;

/** 차단은 일시적일 수 있어 재시도하되, 같은 차단을 매 실행 두드리지 않도록 간격을 둔다. */
export const BLOCKED_RETRY_DAYS = 3;
/** 네이버 결과(found/not_found)를 구글로 업그레이드 시도하는 간격. */
export const NAVER_RETRY_DAYS = 7;
export const NAMUWIKI_FOUND_TTL_DAYS = 30;
export const NAMUWIKI_NOT_FOUND_TTL_DAYS = 7;

export interface ImageCacheRow {
  source: string;
  status: string;
  fetchedAt: Date;
  imageUrl: string | null;
}

export interface ImageTarget {
  query: string;
  /** 이미 이미지가 있는 행 — 재시도가 실패해도 그 이미지를 null로 덮지 않는다. */
  hasImage: boolean;
}

const ageDays = (fetchedAt: Date, nowMs: number) => (nowMs - fetchedAt.getTime()) / DAY_MS;

export function shouldCrawlImage(row: ImageCacheRow | undefined, nowMs: number): boolean {
  if (!row) return true; // never tried
  const age = ageDays(row.fetchedAt, nowMs);
  if (row.source === 'google-crawler') {
    // found / not_found는 확정 결과.
    return row.status === 'blocked' && age > BLOCKED_RETRY_DAYS;
  }
  if (row.source === 'naver') {
    return (row.status === 'found' || row.status === 'not_found') && age > NAVER_RETRY_DAYS;
  }
  return false;
}

/** 크롤 대상만 남기고, 한 번도 시도 안 한 검색어 → 오래전에 시도한 검색어 순으로 정렬. */
export function planImageQueries(
  queries: string[],
  seen: Map<string, ImageCacheRow>,
  nowMs: number,
): ImageTarget[] {
  return queries
    .filter((q) => shouldCrawlImage(seen.get(q), nowMs))
    .sort((a, b) => lastTriedMs(seen.get(a)) - lastTriedMs(seen.get(b)))
    .map((query) => ({ query, hasImage: Boolean(seen.get(query)?.imageUrl) }));
}

// 미시도(0)가 항상 먼저 온다.
const lastTriedMs = (row: ImageCacheRow | undefined) => (row ? row.fetchedAt.getTime() : 0);

export function shouldCrawlNamuwiki(
  row: { status: string; fetchedAt: Date } | undefined,
  nowMs: number,
): boolean {
  if (!row) return true;
  const age = ageDays(row.fetchedAt, nowMs);
  if (row.status === 'blocked') return age > BLOCKED_RETRY_DAYS;
  if (row.status === 'not_found') return age > NAMUWIKI_NOT_FOUND_TTL_DAYS;
  if (row.status === 'found') return age > NAMUWIKI_FOUND_TTL_DAYS;
  return false;
}
