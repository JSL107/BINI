'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { ImageQueryType } from '@bini/types';
import { fetchGameImage, fetchJobImages, reportBadImage } from '../lib/api';
import { JobImageModal } from './JobImageModal';

// SSR 환경에서는 즉시 true로 설정해 fetch 호환 유지
const isSSR = typeof window === 'undefined';

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
  /**
   * true면 next/image priority + 명시적 fetchPriority="high".
   * - priority: next/image가 <link rel="preload">를 head에 emit.
   * - fetchPriority="high": 컴포넌트에서 별도로 추가 (priority만으론 hint 안 emit됨).
   * - 추가로 IntersectionObserver gating을 우회 — priority 카드는 viewport
   *   진입을 기다리지 않고 즉시 fetch해 LCP candidate를 빠르게 표시.
   * 첫 화면 카드(데스크탑 grid-cols-3 첫 줄 = idx<3)에만 부모가 true 전달.
   */
  priority?: boolean;
  /**
   * 서버가 외부 호출 없이 캐시/row에서 뽑은 대표 이미지 1장 (Job.thumbnailUrl).
   * 있으면 carousel을 'ready'로 시드해 SSR HTML에 즉시 <img>를 박는다 → Speed Index↓.
   * hydration 후 fetchJobImages가 carousel을 보강하되, 빈 결과/에러면 이 시드를
   * 유지한다(placeholder로 떨어뜨리지 않음 — 깜빡임/CLS 방지). priority 카드에만 전달됨.
   */
  initialThumbnail?: string;
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
  priority = false,
  initialThumbnail,
}: JobImageCarouselProps) {
  const [state, setState] = useState<State>(
    initialThumbnail
      ? {
          kind: 'ready',
          urls: [initialThumbnail],
          index: 0,
          gameImages: [initialThumbnail],
          companyPhotos: [],
        }
      : { kind: 'loading' },
  );
  const [modalOpen, setModalOpen] = useState(false);
  // priority 카드는 viewport 진입을 기다리지 않고 즉시 fetch — LCP candidate가
  // IntersectionObserver callback(1 frame 지연)을 거치며 늦어지는 회귀 회피.
  const [hasIntersected, setHasIntersected] = useState(isSSR || priority);
  const touchStartX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: 카드가 viewport(200px margin)에 들어오면 fetch 허용.
  // priority 카드는 이미 hasIntersected=true라 IO observe도 skip.
  useEffect(() => {
    if (isSSR || priority) return;
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!hasIntersected) return;
    let alive = true;
    // initialThumbnail로 시드된 경우 loading 리셋을 건너뛴다 — 이미 보이는 SSR
    // 이미지를 skeleton으로 되돌리는 깜빡임 방지.
    if (!initialThumbnail) setState({ kind: 'loading' });

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
        // 회사명 fallback도 시도 — 이미 game_images 캐시에 found row가 있으면
        // 즉시 사용. 캐시 미스 시 서버가 Naver 호출하지만 noise(주가/제품 사진)
        // 위험이 있다. 그 noise는 (a) Naver community/finance blocklist (이미
        // 존재), (b) 사용자 신고 루프 (BadImageService) 로 점진적으로 컷한다.
        // 이 fallback을 완전히 막으면 detail enrichment가 빈 잡들이 통째로
        // "이미지 없음"으로 떨어져 실 사용자 컴플레인이 더 컸다.
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
        } else if (!initialThumbnail) {
          // 빈 결과 — 시드가 없을 때만 placeholder. 시드가 있으면 그대로 유지.
          setState({ kind: 'placeholder' });
        }
      } catch {
        // 에러 — 시드가 없을 때만 placeholder. 시드가 있으면 SSR 이미지를 보존.
        if (alive && !initialThumbnail) setState({ kind: 'placeholder' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [jobId, fallbackQuery, fallbackType, hasIntersected, initialThumbnail]);

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
   * 새로고침 후 다시 노출되지 않는 보장은 서버(`BadImageService`)가 DB lookup으로
   * 매 요청 차단 판정하므로 다중 인스턴스에서도 즉시 반영된다.
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
        ref={rootRef}
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
        {/* next/image fill 모드 — 부모(group relative h-48 w-full)가 박스 크기 결정,
            Image가 그 안을 채운다. priority prop은 부모가 idx<3 카드만 true로 전달.
            Next.js 16의 priority는 <link rel="preload">만 emit하므로 LCP hint를 위해
            fetchPriority="high"를 priority일 때 별도로 명시. sizes는 카드 grid
            (sm:grid-cols-2, lg:grid-cols-3) 기준 — Vercel이 그에 맞춰 width 변환 +
            WebP/AVIF로 캐시. */}
        <Image
          key={url}
          src={url}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          fetchPriority={priority ? 'high' : 'auto'}
          title="클릭해서 크게 보기"
          role="button"
          tabIndex={0}
          aria-label={`${alt} 크게 보기`}
          className="cursor-zoom-in object-cover transition-transform duration-200 group-hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
