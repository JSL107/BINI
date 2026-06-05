// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Job } from '@bini/types';
import { SaveJobButton } from './SaveJobButton';
import { STORAGE_KEY as SAVED_STORAGE_KEY } from '../lib/saved-jobs';

const baseJob: Job = {
  id: 'gamejob:t-001',
  source: 'gamejob',
  company: '회사',
  companyUrl: '',
  title: '잡',
  detailUrl: 'https://example.com/1',
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
  thumbnailUrl: null,
};

describe('SaveJobButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('localStorage에 없으면 aria-pressed="false"로 렌더', () => {
    render(<SaveJobButton job={baseJob} />);
    const btn = screen.getByRole('button', { name: /스크랩(?! 해제)/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('localStorage에 있으면 aria-pressed="true" + 해제 라벨', () => {
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify({
        [baseJob.id]: { savedAt: Date.now(), job: baseJob },
      }),
    );
    render(<SaveJobButton job={baseJob} />);
    const btn = screen.getByRole('button', { name: '스크랩 해제' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('클릭 시 토글 (unsaved → saved)', () => {
    render(<SaveJobButton job={baseJob} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    const stored = JSON.parse(window.localStorage.getItem(SAVED_STORAGE_KEY) ?? '{}');
    expect(stored[baseJob.id]).toBeDefined();
    expect(stored[baseJob.id].job.id).toBe(baseJob.id);
  });

  it('클릭 시 토글 (saved → unsaved)', () => {
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify({
        [baseJob.id]: { savedAt: Date.now(), job: baseJob },
      }),
    );
    render(<SaveJobButton job={baseJob} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    const stored = JSON.parse(window.localStorage.getItem(SAVED_STORAGE_KEY) ?? '{}');
    expect(stored[baseJob.id]).toBeUndefined();
  });

  it('localStorage 쓰기 실패 시 UI는 토글되지 않음 (낙관 토글 방지)', () => {
    // setItem이 QuotaExceededError 던지는 상황 시뮬레이션.
    // jsdom에서 localStorage 메서드는 Storage.prototype 상에 있어,
    // 인스턴스가 아닌 prototype을 spy 해야 호출이 가로채진다.
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    render(<SaveJobButton job={baseJob} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    // 쓰기 실패 → 상태 그대로 유지.
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
