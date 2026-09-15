import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED_RETRY_DAYS,
  NAVER_RETRY_DAYS,
  planImageQueries,
  shouldCrawlImage,
  shouldCrawlNamuwiki,
  type ImageCacheRow,
} from './crawl-policy.js';

const NOW = Date.parse('2026-09-15T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);
const row = (
  source: string,
  status: string,
  ageDays: number,
  imageUrl: string | null = null,
): ImageCacheRow => ({ source, status, fetchedAt: daysAgo(ageDays), imageUrl });

test('image: never tried → crawl', () => {
  assert.equal(shouldCrawlImage(undefined, NOW), true);
});

test('image: google found / not_found are final', () => {
  assert.equal(shouldCrawlImage(row('google-crawler', 'found', 365, 'u'), NOW), false);
  assert.equal(shouldCrawlImage(row('google-crawler', 'not_found', 365), NOW), false);
});

test('image: google blocked retries only after cooldown', () => {
  assert.equal(shouldCrawlImage(row('google-crawler', 'blocked', 0), NOW), false);
  assert.equal(
    shouldCrawlImage(row('google-crawler', 'blocked', BLOCKED_RETRY_DAYS - 0.1), NOW),
    false,
  );
  assert.equal(
    shouldCrawlImage(row('google-crawler', 'blocked', BLOCKED_RETRY_DAYS + 0.1), NOW),
    true,
  );
});

test('image: naver found / not_found upgrade only after cooldown', () => {
  // 이전 규칙에선 이 둘이 매 실행 재시도돼 대기열이 줄지 않았다.
  assert.equal(shouldCrawlImage(row('naver', 'found', 0, 'u'), NOW), false);
  assert.equal(shouldCrawlImage(row('naver', 'not_found', 1), NOW), false);
  assert.equal(shouldCrawlImage(row('naver', 'found', NAVER_RETRY_DAYS + 0.1, 'u'), NOW), true);
  assert.equal(shouldCrawlImage(row('naver', 'not_found', NAVER_RETRY_DAYS + 0.1), NOW), true);
});

test('image: other sources are left alone', () => {
  assert.equal(shouldCrawlImage(row('google-api', 'not_found', 365), NOW), false);
});

test('image plan: never-tried first, then oldest attempt; carries hasImage', () => {
  const seen = new Map<string, ImageCacheRow>([
    ['recent', row('naver', 'found', NAVER_RETRY_DAYS + 1, 'u')],
    ['old', row('naver', 'not_found', NAVER_RETRY_DAYS + 30)],
    ['fresh', row('naver', 'found', 0, 'u')],
    ['done', row('google-crawler', 'found', 100, 'u')],
  ]);
  const plan = planImageQueries(['recent', 'new-a', 'old', 'fresh', 'done', 'new-b'], seen, NOW);
  assert.deepEqual(plan, [
    { query: 'new-a', hasImage: false },
    { query: 'new-b', hasImage: false },
    { query: 'old', hasImage: false },
    { query: 'recent', hasImage: true },
  ]);
});

test('namuwiki: existing TTLs kept, blocked now has a cooldown', () => {
  const nw = (status: string, ageDays: number) => ({ status, fetchedAt: daysAgo(ageDays) });
  assert.equal(shouldCrawlNamuwiki(undefined, NOW), true);
  assert.equal(shouldCrawlNamuwiki(nw('found', 29), NOW), false);
  assert.equal(shouldCrawlNamuwiki(nw('found', 31), NOW), true);
  assert.equal(shouldCrawlNamuwiki(nw('not_found', 6), NOW), false);
  assert.equal(shouldCrawlNamuwiki(nw('not_found', 8), NOW), true);
  assert.equal(shouldCrawlNamuwiki(nw('blocked', 0), NOW), false);
  assert.equal(shouldCrawlNamuwiki(nw('blocked', BLOCKED_RETRY_DAYS + 0.1), NOW), true);
});
