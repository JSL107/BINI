'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type ImageTab = 'game' | 'company';

export interface JobImageModalProps {
  open: boolean;
  /** "게임 관련" 탭의 이미지(대표게임 + 브래킷 네이버). */
  gameImages: string[];
  /** "회사" 탭의 이미지(게임잡 회사 사진). */
  companyPhotos: string[];
  /** 모달을 연 카루셀이 현재 보고 있던 이미지 URL. 그 슬라이드가 속한 탭/인덱스에서 시작. */
  initialUrl: string | null;
  alt: string;
  onClose: () => void;
  /** "이 이미지 잘못됐어요" 클릭 시 부모에게 위임. 부모가 confirm + API 호출 + state 갱신. */
  onReportBad?: (imageUrl: string) => void;
}

/**
 * 클릭-확대 이미지 뷰어 (탭 2개: 게임 관련 / 회사).
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"`.
 *   - 열릴 때 dialog로 포커스 이동, 닫힐 때 트리거로 복귀.
 *   - Tab/Shift+Tab은 dialog 내부에서만 순환 (focus trap).
 *   - Esc 닫기, ←/→ 같은 탭 내 이전/다음, 백드롭 클릭 닫기.
 *   - body scroll lock (open 트랜지션에만, 부모 재렌더에 영향 없음).
 *
 * 초기 탭: `initialUrl`이 속한 그룹을 우선 선택. 매칭 실패 시 게임이 비어있지 않으면 게임, 아니면 회사.
 */
export function JobImageModal({
  open,
  gameImages,
  companyPhotos,
  initialUrl,
  alt,
  onClose,
  onReportBad,
}: JobImageModalProps) {
  const initial = useMemo(() => {
    const inGame = initialUrl ? gameImages.indexOf(initialUrl) : -1;
    if (inGame >= 0) return { tab: 'game' as const, index: inGame };
    const inCompany = initialUrl ? companyPhotos.indexOf(initialUrl) : -1;
    if (inCompany >= 0) return { tab: 'company' as const, index: inCompany };
    if (gameImages.length > 0) return { tab: 'game' as const, index: 0 };
    return { tab: 'company' as const, index: 0 };
  }, [initialUrl, gameImages, companyPhotos]);

  const [tab, setTab] = useState<ImageTab>(initial.tab);
  const [index, setIndex] = useState(initial.index);
  // Track URLs that failed to load. On each new open we reset, so prior failures
  // don't permanently hide working images.
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset to the computed initial whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setTab(initial.tab);
      setIndex(initial.index);
      setFailedUrls(new Set());
    }
  }, [open, initial]);

  // Focus management + scroll lock — only on the open transition.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Keyboard handlers via refs to avoid re-binding on parent renders.
  const tabRef = useRef(tab);
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    tabRef.current = tab;
    urlsRef.current = tab === 'game' ? gameImages : companyPhotos;
  }, [tab, gameImages, companyPhotos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const urls = urlsRef.current;
      if (urls.length > 1 && e.key === 'ArrowLeft') {
        setIndex((i) => (i - 1 + urls.length) % urls.length);
        return;
      }
      if (urls.length > 1 && e.key === 'ArrowRight') {
        setIndex((i) => (i + 1) % urls.length);
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const hasGame = gameImages.length > 0;
  const hasCompany = companyPhotos.length > 0;
  if (!hasGame && !hasCompany) return null;

  const urls = tab === 'game' ? gameImages : companyPhotos;
  const safeIndex = Math.min(index, Math.max(0, urls.length - 1));
  const url = urls[safeIndex];
  const multi = urls.length > 1;
  const advance = (delta: number) =>
    setIndex((i) => (i + delta + urls.length) % urls.length);

  const switchTab = (next: ImageTab) => {
    setTab(next);
    setIndex(0);
    setFailedUrls(new Set());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 확장 보기`}
      data-testid="image-modal"
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 outline-none"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="relative flex max-h-[90vh] max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="이미지 분류"
          className="mb-3 inline-flex self-center rounded-full bg-white/15 p-1 backdrop-blur-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'game'}
            disabled={!hasGame}
            onClick={() => switchTab('game')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'game'
                ? 'bg-white text-gray-900 shadow'
                : 'text-white/80 hover:text-white disabled:opacity-40 disabled:hover:text-white/80'
            }`}
          >
            게임 관련 {hasGame ? `(${gameImages.length})` : '(0)'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'company'}
            disabled={!hasCompany}
            onClick={() => switchTab('company')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'company'
                ? 'bg-white text-gray-900 shadow'
                : 'text-white/80 hover:text-white disabled:opacity-40 disabled:hover:text-white/80'
            }`}
          >
            회사 사진 {hasCompany ? `(${companyPhotos.length})` : '(0)'}
          </button>
        </div>

        {/* Image area — fixed letterbox frame keeps all slides visually uniform
            regardless of source aspect ratio. 모바일은 좁은 폭이라 95vw로 더 차지,
            데스크탑은 sm:w-[80vw]로 기존 디자인 유지. */}
        <div className="relative flex aspect-[16/9] w-[95vw] max-w-5xl items-center justify-center rounded bg-black/85 shadow-xl sm:w-[80vw]">
          {failedUrls.has(url) ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center text-white/90">
              <p className="text-sm">이미지를 불러올 수 없습니다</p>
              <p className="text-xs text-white/60">
                소스가 핫링크를 차단했거나 URL이 만료된 경우입니다.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block rounded bg-white/15 px-3 py-1 text-xs hover:bg-white/25"
              >
                원본 새 창에서 시도 ↗
              </a>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={alt}
              /* user가 모달을 열어 큰 사진을 즉시 봐야 하는 명시적 user intent.
                 loading="eager"는 default이지만 부모 carousel이 lazy hint를 emit하는
                 동안 모달이 자연스럽게 priority bucket을 못 받을 수 있어 명시.
                 fetchPriority="high"로 같은 origin의 다른 fetch(다음 페이지 prefetch
                 등)에 양보하지 않게 함. decoding="async"로 디코드 단계는 main thread 밖. */
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="max-h-full max-w-full object-contain"
              onError={() => {
                // 실패 URL만 표시하고 자동 advance하지 않는다 — 여러 슬라이드가 모두 실패할 때
                // 무한 ←→ 토글 루프가 발생하던 버그 방지. 사용자가 prev/next로 직접 이동.
                setFailedUrls((s) => {
                  if (s.has(url)) return s;
                  const next = new Set(s);
                  next.add(url);
                  return next;
                });
              }}
            />
          )}
          {/* 닫기 — 모바일은 노치/edge 안전영역 안에 두기 위해 프레임 내부 우측 상단에
              배치(right-2 top-2). 데스크탑은 기존대로 프레임 밖으로 살짝 띄움. */}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => onCloseRef.current()}
            className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-white text-xl shadow hover:bg-gray-50 sm:-right-3 sm:-top-3"
          >
            ×
          </button>
          {multi && (
            <>
              <button
                type="button"
                aria-label="이전"
                onClick={() => advance(-1)}
                className="absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/80 text-2xl shadow hover:bg-white"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="다음"
                onClick={() => advance(1)}
                className="absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/80 text-2xl shadow hover:bg-white"
              >
                ›
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                {safeIndex + 1} / {urls.length}
              </span>
            </>
          )}
          {/* "원본 새 창" — 모달 이미지 클릭 affordance가 없다는 피드백 반영. 명시적 링크로 노출.
              모바일 좁은 폭에선 텍스트 축약("원본 ↗")으로 옆 신고 버튼과 안 겹치게. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded bg-white/85 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white"
          >
            <span className="sm:hidden">원본 ↗</span>
            <span className="hidden sm:inline">원본 새 창에서 보기 ↗</span>
          </a>
          {onReportBad && (
            <button
              type="button"
              aria-label="이 이미지가 공고와 안 맞음을 신고"
              data-testid="report-bad-image-modal"
              onClick={(e) => {
                e.stopPropagation();
                onReportBad(url);
              }}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded bg-white/85 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white hover:text-red-600"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 21V4h12l-1.5 4L15 12H3" />
                <line x1="3" y1="21" x2="3" y2="3" />
              </svg>
              {/* 모바일은 아이콘만(텍스트 숨김) — 좁은 폭에서 원본 버튼과 안 겹치게. */}
              <span className="hidden sm:inline">잘못된 이미지 신고</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
