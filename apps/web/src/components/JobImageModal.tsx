'use client';

import { useEffect, useRef, useState } from 'react';

export interface JobImageModalProps {
  open: boolean;
  urls: string[];
  initialIndex: number;
  alt: string;
  onClose: () => void;
}

/**
 * Click-to-expand image viewer.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"`.
 *   - On open, focus moves into the dialog container; on close it returns to
 *     the element that opened the modal.
 *   - Tab/Shift+Tab cycle within the dialog (focus trap).
 *   - Escape closes; ←/→ navigate (when multi-image).
 *   - Backdrop click closes.
 *   - Body scroll locked while open and restored on close (the lock captures
 *     the pre-modal overflow state, not its current state).
 */
export function JobImageModal({
  open,
  urls,
  initialIndex,
  alt,
  onClose,
}: JobImageModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Stable ref to onClose so the keyboard effect does not re-run when the
  // parent passes a new inline callback on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Sync starting slide when the modal (re)opens.
  useEffect(() => {
    if (open) setIndex(Math.min(initialIndex, Math.max(0, urls.length - 1)));
  }, [open, initialIndex, urls.length]);

  // Focus management + body scroll lock — runs ONLY on the open transition,
  // not on every parent re-render.
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

  // Keyboard: Escape / arrows / focus-trap Tab. Reads urls.length via ref to
  // avoid re-binding on every render.
  const urlsLenRef = useRef(urls.length);
  useEffect(() => {
    urlsLenRef.current = urls.length;
  }, [urls.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const n = urlsLenRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (n > 1 && e.key === 'ArrowLeft') {
        setIndex((i) => (i - 1 + n) % n);
        return;
      }
      if (n > 1 && e.key === 'ArrowRight') {
        setIndex((i) => (i + 1) % n);
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

  if (!open || urls.length === 0) return null;

  const url = urls[index];
  const multi = urls.length > 1;
  const advance = (delta: number) =>
    setIndex((i) => (i + delta + urls.length) % urls.length);

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
        className="relative max-h-[90vh] max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={url}
          src={url}
          alt={alt}
          className="max-h-[90vh] max-w-full rounded object-contain shadow-xl"
          onError={() => {
            // Drop the failed URL and stay on the same slot (or close if last).
            if (urls.length <= 1) {
              onCloseRef.current();
            } else {
              setIndex((i) => (i + 1) % urls.length);
            }
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
              {index + 1} / {urls.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
