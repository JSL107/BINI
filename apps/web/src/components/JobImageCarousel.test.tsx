// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { JobImageCarousel } from './JobImageCarousel';

vi.mock('../lib/api', () => ({
  fetchJobImages: vi.fn(async () => ({
    images: ['https://example.com/a.jpg'],
    gameImages: ['https://example.com/a.jpg'],
    companyPhotos: [],
  })),
  fetchGameImage: vi.fn(async () => ({ imageUrl: null })),
  reportBadImage: vi.fn(),
}));

describe('JobImageCarousel — native lazy load 속성', () => {
  afterEach(() => cleanup());

  it('썸네일 img에 loading="lazy" / decoding="async" 적용', async () => {
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="alt-text"
      />,
    );
    // IntersectionObserver stub이 microtask로 isIntersecting=true 통지 → fetch → img 렌더
    const img = await waitFor(() => screen.getByAltText('alt-text'));
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    // fetchPriority는 의도적으로 미설정 — 첫 화면 카드(LCP 후보)의 priority bucket을
    // 강제로 low로 내리지 않기 위해. priority 분기는 단계 2 Next.js <Image>에서 정식 도입.
    expect(img.hasAttribute('fetchpriority')).toBe(false);
  });
});
