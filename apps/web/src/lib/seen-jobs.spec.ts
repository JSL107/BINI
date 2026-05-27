// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SEEN_JOBS_CHANGE_EVENT,
  STORAGE_KEY,
  clearSeenJobs,
  isJobSeen,
  loadSeenJobs,
  markJobAsSeen,
} from './seen-jobs';

describe('seen-jobs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('초기 로드는 빈 객체', () => {
    expect(loadSeenJobs()).toEqual({});
  });

  it('markJobAsSeen은 jobId와 timestamp를 저장한다', () => {
    const before = Date.now();
    markJobAsSeen('gamejob:123');
    const after = Date.now();
    const map = loadSeenJobs();
    expect(Object.keys(map)).toEqual(['gamejob:123']);
    expect(map['gamejob:123']).toBeGreaterThanOrEqual(before);
    expect(map['gamejob:123']).toBeLessThanOrEqual(after);
  });

  it('같은 jobId를 다시 mark하면 timestamp만 갱신', async () => {
    markJobAsSeen('gamejob:123');
    const first = loadSeenJobs()['gamejob:123'];
    await new Promise((r) => setTimeout(r, 5));
    markJobAsSeen('gamejob:123');
    const second = loadSeenJobs()['gamejob:123'];
    expect(second).toBeGreaterThanOrEqual(first);
    expect(Object.keys(loadSeenJobs())).toHaveLength(1);
  });

  it('isJobSeen은 존재 여부만 본다', () => {
    markJobAsSeen('gamejob:1');
    const map = loadSeenJobs();
    expect(isJobSeen(map, 'gamejob:1')).toBe(true);
    expect(isJobSeen(map, 'gamejob:2')).toBe(false);
  });

  it('손상된 JSON은 빈 객체로 폴백(자동 복구)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSeenJobs()).toEqual({});
  });

  it('배열·null도 빈 객체로 폴백', () => {
    window.localStorage.setItem(STORAGE_KEY, '[1,2,3]');
    expect(loadSeenJobs()).toEqual({});
    window.localStorage.setItem(STORAGE_KEY, 'null');
    expect(loadSeenJobs()).toEqual({});
  });

  it('숫자가 아닌 값은 drop (정합성 방어)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ a: 1, b: 'oops', c: 2 }),
    );
    expect(loadSeenJobs()).toEqual({ a: 1, c: 2 });
  });

  it('clearSeenJobs는 storage를 비운다', () => {
    markJobAsSeen('gamejob:1');
    markJobAsSeen('gamejob:2');
    clearSeenJobs();
    expect(loadSeenJobs()).toEqual({});
  });

  it('mark 시 SEEN_JOBS_CHANGE_EVENT가 같은 탭에 발행된다', () => {
    let fired = 0;
    const handler = () => fired++;
    window.addEventListener(SEEN_JOBS_CHANGE_EVENT, handler);
    markJobAsSeen('gamejob:1');
    window.removeEventListener(SEEN_JOBS_CHANGE_EVENT, handler);
    expect(fired).toBe(1);
  });

  it('빈 jobId는 무시(저장 안 함)', () => {
    markJobAsSeen('');
    expect(loadSeenJobs()).toEqual({});
  });

  it('SEEN_CAP 초과 시 timestamp 작은(LRU) 절반을 drop', () => {
    // SEEN_CAP=2000 가정. 2000건을 ts 1000..2999로 prepopulate한 뒤
    // 새 mark 1건을 더해 cap을 트리거.
    const seed: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) seed[`job:${i}`] = 1000 + i;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    markJobAsSeen('job:new');
    const after = loadSeenJobs();

    // 절반 drop 후 1001건(=2001 - 1000) 남아야 함.
    const keys = Object.keys(after);
    expect(keys.length).toBeLessThanOrEqual(2000);
    expect(keys.length).toBe(1001);

    // 새로 추가한 항목은 반드시 남음(가장 큰 ts)
    expect(after['job:new']).toBeDefined();

    // 가장 오래된(ts=1000) job:0은 drop
    expect(after['job:0']).toBeUndefined();
    // 가장 최근(ts=2999) job:1999는 보존
    expect(after['job:1999']).toBeDefined();

    // drop 경계: 첫 1000개(job:0~job:999)는 drop, 그 이후는 보존
    expect(after['job:999']).toBeUndefined();
    expect(after['job:1000']).toBeDefined();
  });
});
