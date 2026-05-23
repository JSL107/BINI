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

        {/* Image area */}
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={url}
            src={url}
            alt={alt}
            className="max-h-[80vh] max-w-full rounded object-contain shadow-xl"
            onError={() => {
              if (urls.length <= 1) onCloseRef.current();
              else setIndex((i) => (i + 1) % urls.length);
            }}
          />
          <button
            type="button"
            aria-label="닫기"
            onClick={() => onCloseRef.current()}
            className="absolute -right-3 -top-3 h-9 w-9 rounded-full bg-white text-xl shadow hover:bg-gray-50"
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
        </div>
      </div>
    </div>
  );
}
