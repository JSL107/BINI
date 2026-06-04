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

  it('priority=false(default)면 lazy + fetchPriority 미설정(또는 auto)', async () => {
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
    // fetchPriority는 priority=false라 high로 안 올라가야 함. 미설정 또는 "auto".
    const fp = img.getAttribute('fetchpriority');
    expect(fp === null || fp === 'auto').toBe(true);
  });

  it('priority=true면 fetchPriority="high" + 비-lazy', async () => {
    // step 2 핵심 — LCP candidate 카드는 priority가 부모(JobsGridWithFilter)에서 흘러옴.
    // priority 단독으론 next/image가 <link rel="preload">만 emit하므로 fetchPriority
    // hint는 컴포넌트에서 명시적으로 emit해야 한다. 이 가드가 없으면 누군가 prop을
    // 누락해도 silent하게 LCP 부스트가 사라진다.
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="alt-text"
        priority
      />,
    );
    const img = await waitFor(() => screen.getByAltText('alt-text'));
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('loading')).not.toBe('lazy');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });
});
