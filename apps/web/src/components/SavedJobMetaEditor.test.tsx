// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Job } from '@bini/types';
import { SavedJobMetaEditor } from './SavedJobMetaEditor';
import {
  STORAGE_KEY as SAVED_STORAGE_KEY,
  loadSavedJobs,
  saveJob,
} from '../lib/saved-jobs';

function mkJob(id: string): Job {
  return {
    id,
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
}

describe('SavedJobMetaEditor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // editor가 updateSavedJobMeta로 쓰려면 잡이 이미 saved 상태여야 한다.
    saveJob(mkJob('gamejob:1'));
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('상태 chip 클릭 시 localStorage에 status 저장', () => {
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /지원/, pressed: false }));
    expect(loadSavedJobs()['gamejob:1'].status).toBe('applied');
  });

  it('같은 chip 다시 누르면 미설정으로 토글', () => {
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status="applied" />);
    fireEvent.click(screen.getByRole('button', { name: /지원/, pressed: true }));
    expect(loadSavedJobs()['gamejob:1'].status).toBeUndefined();
  });

  it('미설정(undefined) 상태에선 검토중 chip이 active', () => {
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status={undefined} />);
    const considering = screen.getByRole('button', { name: /검토중/ });
    expect(considering).toHaveAttribute('aria-pressed', 'true');
  });

  it('textarea blur 시 note 저장', () => {
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status={undefined} />);
    const ta = screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '  1차 면접 6/5  ' } });
    // 입력 중엔 아직 안 저장.
    expect(loadSavedJobs()['gamejob:1'].note).toBeUndefined();
    fireEvent.blur(ta);
    expect(loadSavedJobs()['gamejob:1'].note).toBe('1차 면접 6/5');
  });

  it('textarea를 비우고 blur하면 note 필드 삭제', () => {
    saveJob(mkJob('gamejob:1'));
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify({
        'gamejob:1': {
          savedAt: Date.now(),
          job: mkJob('gamejob:1'),
          note: '기존 메모',
        },
      }),
    );
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note="기존 메모" status={undefined} />);
    const ta = screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '' } });
    fireEvent.blur(ta);
    expect(loadSavedJobs()['gamejob:1'].note).toBeUndefined();
  });

  it('변경 없이 blur는 쓰기 발생 안 함 (idempotent)', () => {
    saveJob(mkJob('gamejob:1'));
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify({
        'gamejob:1': {
          savedAt: 1000,
          job: mkJob('gamejob:1'),
          note: '메모',
        },
      }),
    );
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note="메모" status={undefined} />);
    const before = window.localStorage.getItem(SAVED_STORAGE_KEY);
    const ta = screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement;
    fireEvent.blur(ta);
    expect(window.localStorage.getItem(SAVED_STORAGE_KEY)).toBe(before);
  });

  it('blur 후 textarea도 trim된 형태로 정렬된다 (draft vs 저장값 불일치 방지)', () => {
    render(<SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status={undefined} />);
    const ta = screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '  메모  ' } });
    fireEvent.blur(ta);
    expect(loadSavedJobs()['gamejob:1'].note).toBe('메모');
    expect(ta.value).toBe('메모');
  });

  it('"검토중" 클릭은 status를 미설정(undefined)으로 저장 (명시 considering 미사용)', () => {
    window.localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify({
        'gamejob:1': {
          savedAt: Date.now(),
          job: mkJob('gamejob:1'),
          status: 'applied',
        },
      }),
    );
    render(
      <SavedJobMetaEditor job={mkJob('gamejob:1')} note={undefined} status="applied" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /검토중/ }));
    expect(loadSavedJobs()['gamejob:1'].status).toBeUndefined();
  });

  it('입력 중엔 외부 prop 변경 무시, blur 후엔 외부값으로 회복', () => {
    saveJob(mkJob('gamejob:1'));
    const { rerender } = render(
      <SavedJobMetaEditor job={mkJob('gamejob:1')} note="기존" status={undefined} />,
    );
    const ta = screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement;
    ta.focus();
    // 외부에서 note 변경 (다른 탭/카드 동기화) — 입력 중이라 draft에 안 덮임.
    rerender(
      <SavedJobMetaEditor job={mkJob('gamejob:1')} note="외부 변경" status={undefined} />,
    );
    expect(ta.value).toBe('기존');
    // 사용자가 아무 입력 없이 blur — 외부 변경이 회복돼야 한다.
    fireEvent.blur(ta);
    expect(ta.value).toBe('외부 변경');
  });
});
