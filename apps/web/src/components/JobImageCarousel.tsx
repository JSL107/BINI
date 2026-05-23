'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageQueryType } from '@bini/types';
import { fetchGameImage, fetchJobImages, reportBadImage } from '../lib/api';
import { JobImageModal } from './JobImageModal';

type State =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      urls: string[];
      index: number;
      gameImages: string[];
      companyPhotos: string[];
    }
  | { kind: 'placeholder' };

export interface JobImageCarouselProps {
  jobId: string;
  /** Naver 폴백 검색어 (게임잡 enrichment가 비어있을 때 단일 이미지 폴백). */
  fallbackQuery: string;
  fallbackType: ImageQueryType;
  alt: string;
}

/**
 * 카드 이미지 영역. 우선순위(API에서 결정):
 *   1) 대표게임 네이버 이미지 — "이 회사가 어떤 게임을 만드는가" 시각 정보 우선
 *   2) 제목 대괄호 게임 네이버 이미지
 *   3) GameJob 상세페이지의 회사 사진
 * 비어 있으면 네이버 단일 이미지로 폴백, 그것도 없으면 "이미지 없음" 플레이스홀더.
 * 이미지 클릭 → JobImageModal 확대 보기. ⛶ 매그니파이어 아이콘 + 호버 라벨로 affordance 표시.
 */
export function JobImageCarousel({
  jobId,
  fallbackQuery,
  fallbackType,
  alt,
}: JobImageCarouselProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const jobImages = await fetchJobImages(jobId);
        if (!alive) return;
        if (jobImages.images.length > 0) {
          setState({
            kind: 'ready',
            urls: jobImages.images,
            index: 0,
            gameImages: jobImages.gameImages,
            companyPhotos: jobImages.companyPhotos,
          });
          return;
        }
        const single = await fetchGameImage(fallbackQuery, fallbackType);
        if (!alive) return;
        if (single.imageUrl) {
          setState({
            kind: 'ready',
            urls: [single.imageUrl],
            index: 0,
            gameImages: [single.imageUrl],
            companyPhotos: [],
          });
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
      return { ...s, urls: next, index: Math.min(s.index, next.length - 1) };
    });
  };

  /**
   * "이 이미지 잘못됐어요" — confirm 후 서버에 신고 + 카루셀/모달 state에서
   * 같은 URL을 모두 제거 (optimistic). 신고는 fire-and-forget (API 실패해도 UX 흐름 유지).
   */
  const reportBad = useCallback(
    (badUrl: string) => {
      const ok = window.confirm(
        '이 이미지를 "공고와 안 맞음"으로 신고합니다. 이 이미지는 다시 노출되지 않습니다.',
      );
      if (!ok) return;
      void reportBadImage(badUrl, jobId);
      setState((s) => {
        if (s.kind !== 'ready') return s;
        const nextUrls = s.urls.filter((u) => u !== badUrl);
        const nextGame = s.gameImages.filter((u) => u !== badUrl);
        const nextCompany = s.companyPhotos.filter((u) => u !== badUrl);
        if (nextUrls.length === 0) {
          setModalOpen(false);
          return { kind: 'placeholder' };
        }
        return {
          ...s,
          urls: nextUrls,
          index: Math.min(s.index, nextUrls.length - 1),
          gameImages: nextGame,
          companyPhotos: nextCompany,
        };
      });
    },
    [jobId],
  );

  // Stable ref so JobImageModal's keyboard effect does not re-run on parent renders.
  const closeModal = useCallback(() => setModalOpen(false), []);
  const openModal = useCallback(() => setModalOpen(true), []);
  const onImageKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLImageElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setModalOpen(true);
      }
    },
    [],
  );

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

  const { urls, index, gameImages, companyPhotos } = state;
  const url = urls[index];
  const multi = urls.length > 1;

  return (
    <>
      <div
        data-testid="image-carousel"
        className="group relative h-48 w-full overflow-hidden bg-gray-100"
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
          title="클릭해서 크게 보기"
          role="button"
          tabIndex={0}
          aria-label={`${alt} 크게 보기`}
          className="h-48 w-full cursor-zoom-in object-cover transition-transform duration-200 group-hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onError={() => dropFailed(url)}
          onClick={openModal}
          onKeyDown={onImageKeyDown}
        />
        {/* 클릭 affordance: 항상 보이는 매그니파이어 아이콘 + 호버 시 라벨 + cursor-zoom-in */}
        <span
          aria-hidden="true"
          data-testid="zoom-affordance"
          className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-gray-700 shadow ring-1 ring-black/5 opacity-90 transition-opacity group-hover:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </span>
        {/* "이 이미지 잘못됐어요" 신고. 호버 시 노출 — 매그니파이어 옆. */}
        <button
          type="button"
          aria-label="이 이미지가 공고와 안 맞음을 신고"
          title="공고와 안 맞는 이미지로 신고"
          data-testid="report-bad-image"
          onClick={(e) => {
            e.stopPropagation();
            reportBad(url);
          }}
          className="absolute right-10 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-gray-500 opacity-0 shadow ring-1 ring-black/5 transition hover:bg-white hover:text-red-600 group-hover:opacity-90"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 21V4h12l-1.5 4L15 12H3" />
            <line x1="3" y1="21" x2="3" y2="3" />
          </svg>
        </button>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          클릭해서 크게 보기
        </span>
        {multi && (
          <>
            <button
              type="button"
              aria-label="이전 이미지"
              onClick={(e) => {
                e.stopPropagation();
                advance(-1);
              }}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 py-1 text-base shadow hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="다음 이미지"
              onClick={(e) => {
                e.stopPropagation();
                advance(1);
              }}
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
      <JobImageModal
        open={modalOpen}
        gameImages={gameImages}
        companyPhotos={companyPhotos}
        initialUrl={url}
        alt={alt}
        onClose={closeModal}
        onReportBad={reportBad}
      />
    </>
  );
}
