// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  VISIT_BASELINE_CHANGE_EVENT,
  VISIT_BASELINE_STORAGE_KEY,
  clearVisitBaseline,
  loadVisitBaseline,
  setVisitBaseline,
} from './visit-baseline';

describe('visit-baseline', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('초기엔 null', () => {
    expect(loadVisitBaseline()).toBeNull();
  });

  it('set 후 load는 같은 ISO 반환', () => {
    const iso = '2026-05-27T10:00:00.000Z';
    setVisitBaseline(iso);
    expect(loadVisitBaseline()).toBe(iso);
  });

  it('set은 CustomEvent를 발행', () => {
    let fired = 0;
    const handler = () => fired++;
    window.addEventListener(VISIT_BASELINE_CHANGE_EVENT, handler);
    setVisitBaseline(new Date().toISOString());
    window.removeEventListener(VISIT_BASELINE_CHANGE_EVENT, handler);
    expect(fired).toBe(1);
  });

  it('손상된 ISO는 null 폴백', () => {
    window.localStorage.setItem(VISIT_BASELINE_STORAGE_KEY, 'not-an-iso');
    expect(loadVisitBaseline()).toBeNull();
  });

  it('빈 문자열도 null 폴백', () => {
    window.localStorage.setItem(VISIT_BASELINE_STORAGE_KEY, '');
    expect(loadVisitBaseline()).toBeNull();
  });

  it('clear는 storage 비우고 이벤트 발행', () => {
    setVisitBaseline(new Date().toISOString());
    let fired = 0;
    window.addEventListener(VISIT_BASELINE_CHANGE_EVENT, () => fired++);
    clearVisitBaseline();
    expect(loadVisitBaseline()).toBeNull();
    expect(fired).toBe(1);
  });
});
