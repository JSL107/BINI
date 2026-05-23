'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageQueryType } from '@bini/types';
import { fetchGameImage, fetchJobImages } from '../lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; urls: string[]; index: number }
  | { kind: 'placeholder' };

export interface JobImageCarouselProps {
  jobId: string;
  /** Naver 폴백 검색어 (게임잡 회사사진이 없을 때 사용). */
  fallbackQuery: string;
  fallbackType: ImageQueryType;
  alt: string;
}

/**
 * 카드 이미지 영역. 우선순위:
 *   1) GET /api/job-images?id= → 게임잡 상세페이지 회사사진(보통 4장).
 *   2) 위가 비어있으면 GET /api/game-image → 네이버 단일 이미지.
 *   3) 둘 다 실패하면 "이미지 없음" 플레이스홀더.
 * 다중 이미지면 prev/next 버튼 + 터치 스와이프 + "n/N" 인디케이터.
 * 개별 `<img>` onError가 발생하면 해당 URL을 제외하고 나머지로 계속 표시.
 */
export function JobImageCarousel({
  jobId,
  fallbackQuery,
  fallbackType,
  alt,
}: JobImageCarouselProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const jobImages = await fetchJobImages(jobId);
        if (!alive) return;
        if (jobImages.images.length > 0) {
          setState({ kind: 'ready', urls: jobImages.images, index: 0 });
          return;
        }
        const single = await fetchGameImage(fallbackQuery, fallbackType);
        if (!alive) return;
        if (single.imageUrl) {
          setState({ kind: 'ready', urls: [single.imageUrl], index: 0 });
        } else {
          setState({ kind: 'placeholder' });
        }
      } catch {
        if (alive) setState({ kind: 'placeholder' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [jobId, fallbackQuery, fallbackType]);

  const advance = (delta: number) => {
    setState((s) => {
      if (s.kind !== 'ready') return s;
      const n = s.urls.length;
      const next = ((s.index + delta) % n + n) % n;
      return { ...s, index: next };
    });
  };

  const dropFailed = (failedUrl: string) => {
    setState((s) => {
      if (s.kind !== 'ready') return s;
      const next = s.urls.filter((u) => u !== failedUrl);
      if (next.length === 0) return { kind: 'placeholder' };
      return { kind: 'ready', urls: next, index: Math.min(s.index, next.length - 1) };
    });
  };

  if (state.kind === 'loading') {
    return (
      <div
        data-testid="image-skeleton"
        className="h-48 w-full animate-pulse bg-gray-200"
      />
    );
  }
  if (state.kind === 'placeholder') {
    return (
      <div
        data-testid="image-placeholder"
        className="flex h-48 w-full items-center justify-center bg-gray-100 text-sm text-gray-400"
      >
        이미지 없음
      </div>
    );
  }

  const { urls, index } = state;
  const url = urls[index];
  const multi = urls.length > 1;

  return (
    <div
      data-testid="image-carousel"
      className="relative h-48 w-full overflow-hidden bg-gray-100"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const dx = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={url}
        src={url}
        alt={alt}
        className="h-48 w-full object-cover"
        onError={() => dropFailed(url)}
      />
      {multi && (
        <>
          <button
            type="button"
            aria-label="이전 이미지"
            onClick={() => advance(-1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 py-1 text-base shadow hover:bg-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 이미지"
            onClick={() => advance(1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 py-1 text-base shadow hover:bg-white"
          >
            ›
          </button>
          <span
            data-testid="image-index"
            className="absolute bottom-1 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
          >
            {index + 1} / {urls.length}
          </span>
        </>
      )}
    </div>
  );
}
