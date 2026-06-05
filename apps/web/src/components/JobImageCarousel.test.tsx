// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { JobImageCarousel } from './JobImageCarousel';
import { fetchJobImages, fetchGameImage } from '../lib/api';

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

describe('JobImageCarousel — initialThumbnail (SSR 시드 / progressive enhancement)', () => {
  afterEach(() => cleanup());

  it('initialThumbnail이 있으면 fetch 완료 전에도 즉시 이미지를 렌더한다', () => {
    // fetch를 영원히 pending으로 둬서 "fetch 결과 없이도 SSR 이미지가 보임"을 검증.
    (fetchJobImages as Mock).mockImplementation(() => new Promise<never>(() => {}));
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="seed-alt"
        priority
        initialThumbnail="https://seed.example.com/s.jpg"
      />,
    );
    // 동기적으로 즉시 존재 — waitFor 불필요 (skeleton 아님).
    const img = screen.getByAltText('seed-alt');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src') ?? '').toContain('s.jpg');
  });

  it('fetch가 빈 결과여도 initialThumbnail을 유지한다 (placeholder로 안 떨어짐)', async () => {
    (fetchJobImages as Mock).mockResolvedValue({
      images: [],
      gameImages: [],
      companyPhotos: [],
    });
    (fetchGameImage as Mock).mockResolvedValue({ imageUrl: null });
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="seed-alt"
        priority
        initialThumbnail="https://seed.example.com/s.jpg"
      />,
    );
    await waitFor(() => expect(fetchJobImages).toHaveBeenCalled());
    expect(screen.queryByText('이미지 없음')).toBeNull();
    expect(screen.getByAltText('seed-alt').tagName).toBe('IMG');
  });

  it('fetch가 에러나도 initialThumbnail을 유지한다', async () => {
    (fetchJobImages as Mock).mockRejectedValue(new Error('network'));
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="seed-alt"
        priority
        initialThumbnail="https://seed.example.com/s.jpg"
      />,
    );
    await waitFor(() => expect(fetchJobImages).toHaveBeenCalled());
    expect(screen.queryByText('이미지 없음')).toBeNull();
    expect(screen.getByAltText('seed-alt').tagName).toBe('IMG');
  });

  it('fetch 성공 시 다중 이미지 carousel로 보강한다 (1 / 2 인덱스 노출)', async () => {
    (fetchJobImages as Mock).mockResolvedValue({
      images: ['https://a.example.com/a.jpg', 'https://b.example.com/b.jpg'],
      gameImages: ['https://a.example.com/a.jpg'],
      companyPhotos: ['https://b.example.com/b.jpg'],
    });
    render(
      <JobImageCarousel
        jobId="gamejob:1"
        fallbackQuery="q"
        fallbackType="company"
        alt="seed-alt"
        priority
        initialThumbnail="https://seed.example.com/s.jpg"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('image-index')).toHaveTextContent('1 / 2'),
    );
  });
});
