// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AttributeFilterBar } from './AttributeFilterBar';

const push = vi.fn();

// useSearchParams는 의도적으로 제공하지 않는다 — 리팩토링 후 컴포넌트가 그것을
// 쓰지 않아야(=서버 prop만으로 동작) CLS가 해소된다. 쓰면 mock 부재로 throw해 회귀 감지.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
}));

function parseLastPush(): URLSearchParams {
  const arg = push.mock.calls.at(-1)![0] as string;
  const qs = arg.includes('?') ? arg.split('?')[1] : '';
  return new URLSearchParams(qs);
}

describe('AttributeFilterBar — searchParams prop 기반 (CLS 해소)', () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it('prop으로 받은 활성 필터를 aria-pressed로 표시한다', () => {
    render(
      <AttributeFilterBar
        experience="newcomer"
        employmentType=""
        location="서울"
        remote={false}
      />,
    );
    expect(screen.getByRole('button', { name: '신입' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '서울' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '주니어' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('연차 칩 토글 시 experience를 set하고 page를 제거한다', () => {
    render(<AttributeFilterBar experience="" employmentType="" location="" remote={false} />);
    fireEvent.click(screen.getByRole('button', { name: '신입' }));
    const qs = parseLastPush();
    expect(qs.get('experience')).toBe('newcomer');
    expect(qs.has('page')).toBe(false);
  });

  it('이미 활성인 필터를 다시 누르면 제거한다', () => {
    render(<AttributeFilterBar experience="newcomer" employmentType="" location="" remote={false} />);
    fireEvent.click(screen.getByRole('button', { name: '신입' }));
    const qs = parseLastPush();
    expect(qs.has('experience')).toBe(false);
  });

  it('토글 시 기존 q(검색어)와 sort를 보존한다', () => {
    render(
      <AttributeFilterBar
        experience=""
        employmentType=""
        location=""
        remote={false}
        search="원화"
        sort="deadline-soonest"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '서울' }));
    const qs = parseLastPush();
    expect(qs.get('q')).toBe('원화');
    expect(qs.get('sort')).toBe('deadline-soonest');
    expect(qs.get('location')).toBe('서울');
  });

  it('재택/원격 토글 시 remote=true를 set한다', () => {
    render(<AttributeFilterBar experience="" employmentType="" location="" remote={false} />);
    fireEvent.click(screen.getByRole('button', { name: '재택/원격 가능' }));
    const qs = parseLastPush();
    expect(qs.get('remote')).toBe('true');
  });

  it('필터 초기화는 모든 속성 필터를 제거한다', () => {
    render(
      <AttributeFilterBar
        experience="newcomer"
        employmentType="fulltime"
        location="서울"
        remote={true}
        search="원화"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    const qs = parseLastPush();
    expect(qs.has('experience')).toBe(false);
    expect(qs.has('employmentType')).toBe(false);
    expect(qs.has('location')).toBe(false);
    expect(qs.has('remote')).toBe(false);
    // q(검색어)는 속성 필터가 아니므로 보존
    expect(qs.get('q')).toBe('원화');
  });
});
