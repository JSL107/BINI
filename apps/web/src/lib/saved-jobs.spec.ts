// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@bini/types';
import {
  SAVED_APPLICATION_STATUSES,
  SAVED_JOBS_CHANGE_EVENT,
  STORAGE_KEY,
  clearSavedJobs,
  isJobSaved,
  listSavedJobsByRecent,
  loadSavedJobs,
  saveJob,
  unsaveJob,
  updateSavedJobMeta,
} from './saved-jobs';

function mkJob(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    source: 'gamejob',
    company: '회사',
    companyUrl: '',
    title: `잡 ${id}`,
    detailUrl: `https://example.com/${id}`,
    deadline: '상시',
    deadlineAt: null,
    jobplanet: null,
    registeredAt: '2026-06-01T00:00:00.000Z',
    tags: [],
    gameTitle: null,
    imageQuery: '',
    imageQueryType: 'company',
    alternateSources: [],
    companyLogoUrl: null,
    companyPhotos: [],
    representativeGames: [],
    expired: false,
    experienceLevel: null,
    employmentType: null,
    locations: [],
    isRemote: false,
    ...over,
  };
}

describe('saved-jobs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('초기 로드는 빈 객체', () => {
    expect(loadSavedJobs()).toEqual({});
  });

  it('saveJob은 jobId 키로 entry 저장 + savedAt 채움', () => {
    const before = Date.now();
    saveJob(mkJob('gamejob:1'));
    const after = Date.now();
    const map = loadSavedJobs();
    expect(Object.keys(map)).toEqual(['gamejob:1']);
    expect(map['gamejob:1'].job.id).toBe('gamejob:1');
    expect(map['gamejob:1'].savedAt).toBeGreaterThanOrEqual(before);
    expect(map['gamejob:1'].savedAt).toBeLessThanOrEqual(after);
  });

  it('같은 jobId 재저장은 savedAt 갱신 + job 덮어쓰기', async () => {
    saveJob(mkJob('gamejob:1', { title: '옛 제목' }));
    const first = loadSavedJobs()['gamejob:1'].savedAt;
    await new Promise((r) => setTimeout(r, 5));
    saveJob(mkJob('gamejob:1', { title: '새 제목' }));
    const updated = loadSavedJobs()['gamejob:1'];
    expect(updated.savedAt).toBeGreaterThanOrEqual(first);
    expect(updated.job.title).toBe('새 제목');
    expect(Object.keys(loadSavedJobs())).toHaveLength(1);
  });

  it('unsaveJob은 해당 entry 삭제', () => {
    saveJob(mkJob('gamejob:1'));
    saveJob(mkJob('gamejob:2'));
    unsaveJob('gamejob:1');
    expect(Object.keys(loadSavedJobs())).toEqual(['gamejob:2']);
  });

  it('unsaveJob 무관한 ID는 no-op', () => {
    saveJob(mkJob('gamejob:1'));
    unsaveJob('gamejob:999');
    expect(Object.keys(loadSavedJobs())).toEqual(['gamejob:1']);
  });

  it('isJobSaved는 존재 여부만 본다', () => {
    saveJob(mkJob('gamejob:1'));
    const map = loadSavedJobs();
    expect(isJobSaved(map, 'gamejob:1')).toBe(true);
    expect(isJobSaved(map, 'gamejob:2')).toBe(false);
  });

  it('listSavedJobsByRecent는 savedAt desc로 정렬', () => {
    saveJob(mkJob('gamejob:old', { title: '오래된' }));
    // 시각 차이 보장
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'gamejob:old': { savedAt: 1000, job: mkJob('gamejob:old', { title: '오래된' }) },
        'gamejob:new': { savedAt: 2000, job: mkJob('gamejob:new', { title: '최근' }) },
      }),
    );
    const list = listSavedJobsByRecent(loadSavedJobs());
    expect(list.map((e) => e.job.id)).toEqual(['gamejob:new', 'gamejob:old']);
  });

  it('손상된 JSON / 배열 / null은 빈 객체로 폴백', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSavedJobs()).toEqual({});
    window.localStorage.setItem(STORAGE_KEY, '[1,2,3]');
    expect(loadSavedJobs()).toEqual({});
    window.localStorage.setItem(STORAGE_KEY, 'null');
    expect(loadSavedJobs()).toEqual({});
  });

  it('정합성 위반 entry는 drop (savedAt 숫자 X / job.id 키 불일치 / job 없음)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ok: { savedAt: 100, job: mkJob('ok') },
        'bad-savedAt': { savedAt: 'oops', job: mkJob('bad-savedAt') },
        'no-job': { savedAt: 100 },
        'id-mismatch': { savedAt: 100, job: mkJob('different-id') },
      }),
    );
    expect(Object.keys(loadSavedJobs())).toEqual(['ok']);
  });

  it('clearSavedJobs는 비우고 CustomEvent 발행', () => {
    saveJob(mkJob('gamejob:1'));
    let fired = 0;
    const handler = () => fired++;
    window.addEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
    clearSavedJobs();
    window.removeEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
    expect(loadSavedJobs()).toEqual({});
    expect(fired).toBe(1);
  });

  it('saveJob/unsaveJob 모두 CustomEvent 발행 (같은 탭 동기화)', () => {
    let fired = 0;
    const handler = () => fired++;
    window.addEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
    saveJob(mkJob('gamejob:1'));
    unsaveJob('gamejob:1');
    window.removeEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
    expect(fired).toBe(2);
  });

  it('빈 jobId / job 없음은 무시 (저장 안 함)', () => {
    saveJob({ id: '' } as Job);
    expect(loadSavedJobs()).toEqual({});
  });

  it('SAVED_CAP(100) 초과 시 savedAt 작은(LRU) 절반 drop', () => {
    // 100건을 ts 1000..1099로 prepopulate한 뒤 새 저장 1건으로 cap 트리거.
    const seed: Record<string, { savedAt: number; job: Job }> = {};
    for (let i = 0; i < 100; i++) {
      const id = `job:${i}`;
      seed[id] = { savedAt: 1000 + i, job: mkJob(id) };
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    saveJob(mkJob('job:new'));
    const after = loadSavedJobs();

    // 50개 drop 후 51개 남음(100 - 50 + 1).
    const keys = Object.keys(after);
    expect(keys.length).toBe(51);

    // 새로 저장한 항목은 보존
    expect(after['job:new']).toBeDefined();
    // 가장 오래된(ts=1000) job:0은 drop
    expect(after['job:0']).toBeUndefined();
    // 경계: 첫 50개(job:0~job:49)는 drop, 그 이후는 보존
    expect(after['job:49']).toBeUndefined();
    expect(after['job:50']).toBeDefined();
  });

  describe('updateSavedJobMeta', () => {
    it('미저장 잡엔 적용하지 않고 false', () => {
      const ok = updateSavedJobMeta('gamejob:none', { status: 'applied' });
      expect(ok).toBe(false);
      expect(loadSavedJobs()).toEqual({});
    });

    it('status 설정 → entry에 status + updatedAt 저장', () => {
      saveJob(mkJob('gamejob:1'));
      const before = Date.now();
      const ok = updateSavedJobMeta('gamejob:1', { status: 'applied' });
      expect(ok).toBe(true);
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.status).toBe('applied');
      expect(entry.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('status null/undefined → 필드 삭제 ("미설정"으로 되돌리기)', () => {
      saveJob(mkJob('gamejob:1'));
      updateSavedJobMeta('gamejob:1', { status: 'applied' });
      updateSavedJobMeta('gamejob:1', { status: null });
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.status).toBeUndefined();
    });

    it('잘못된 status는 미설정으로 처리 (enum 외 값은 무시)', () => {
      saveJob(mkJob('gamejob:1'));
      // @ts-expect-error — 런타임 방어 검증.
      updateSavedJobMeta('gamejob:1', { status: 'wat' });
      expect(loadSavedJobs()['gamejob:1'].status).toBeUndefined();
    });

    it('note 설정 → trim + 저장', () => {
      saveJob(mkJob('gamejob:1'));
      updateSavedJobMeta('gamejob:1', { note: '  지원 완료. 1차 면접 6/5.  ' });
      expect(loadSavedJobs()['gamejob:1'].note).toBe('지원 완료. 1차 면접 6/5.');
    });

    it('note 500자 cap', () => {
      saveJob(mkJob('gamejob:1'));
      const long = 'a'.repeat(1000);
      updateSavedJobMeta('gamejob:1', { note: long });
      expect(loadSavedJobs()['gamejob:1'].note?.length).toBe(500);
    });

    it('note 빈 문자열/null/공백뿐 → 필드 삭제', () => {
      saveJob(mkJob('gamejob:1'));
      updateSavedJobMeta('gamejob:1', { note: '메모' });
      updateSavedJobMeta('gamejob:1', { note: '   ' });
      expect(loadSavedJobs()['gamejob:1'].note).toBeUndefined();
      updateSavedJobMeta('gamejob:1', { note: '메모2' });
      updateSavedJobMeta('gamejob:1', { note: null });
      expect(loadSavedJobs()['gamejob:1'].note).toBeUndefined();
    });

    it('patch에 키가 없으면 해당 필드는 안 건드림', () => {
      saveJob(mkJob('gamejob:1'));
      updateSavedJobMeta('gamejob:1', { note: '유지', status: 'applied' });
      // status만 변경 — note는 그대로
      updateSavedJobMeta('gamejob:1', { status: 'interview' });
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.note).toBe('유지');
      expect(entry.status).toBe('interview');
    });

    it('CustomEvent 발행 (다른 카드/탭 동기화)', () => {
      saveJob(mkJob('gamejob:1'));
      let fired = 0;
      const handler = () => fired++;
      window.addEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
      updateSavedJobMeta('gamejob:1', { status: 'applied' });
      window.removeEventListener(SAVED_JOBS_CHANGE_EVENT, handler);
      expect(fired).toBe(1);
    });
  });

  describe('saveJob/unsaveJob meta interaction', () => {
    it('재저장(별 다시 누르기)은 기존 note/status를 보존한다', () => {
      saveJob(mkJob('gamejob:1', { title: '옛 제목' }));
      updateSavedJobMeta('gamejob:1', { note: '메모', status: 'interview' });
      saveJob(mkJob('gamejob:1', { title: '새 제목' }));
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.job.title).toBe('새 제목');
      expect(entry.note).toBe('메모');
      expect(entry.status).toBe('interview');
    });

    it('unsave 후 재저장은 빈 메타로 시작 (해제로 사용자 메타 정리 의도)', () => {
      saveJob(mkJob('gamejob:1'));
      updateSavedJobMeta('gamejob:1', { note: '메모', status: 'applied' });
      unsaveJob('gamejob:1');
      saveJob(mkJob('gamejob:1'));
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.note).toBeUndefined();
      expect(entry.status).toBeUndefined();
    });
  });

  describe('loadSavedJobs 메타 검증', () => {
    it('유효 status / note / updatedAt은 로드', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          'gamejob:1': {
            savedAt: 100,
            job: mkJob('gamejob:1'),
            note: '메모',
            status: 'applied',
            updatedAt: 200,
          },
        }),
      );
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry.note).toBe('메모');
      expect(entry.status).toBe('applied');
      expect(entry.updatedAt).toBe(200);
    });

    it('손상 status (enum 외) / updatedAt 비숫자는 drop, entry 자체는 보존', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          'gamejob:1': {
            savedAt: 100,
            job: mkJob('gamejob:1'),
            status: 'invalid',
            updatedAt: 'oops',
          },
        }),
      );
      const entry = loadSavedJobs()['gamejob:1'];
      expect(entry).toBeDefined();
      expect(entry.status).toBeUndefined();
      expect(entry.updatedAt).toBeUndefined();
    });

    it('SAVED_APPLICATION_STATUSES는 5단계 enum', () => {
      expect(SAVED_APPLICATION_STATUSES).toEqual([
        'considering',
        'applied',
        'interview',
        'rejected',
        'offered',
      ]);
    });
  });
});
