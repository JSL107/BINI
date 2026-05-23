'use client';

import { useEffect, useState } from 'react';

export interface JobImageModalProps {
  open: boolean;
  urls: string[];
  initialIndex: number;
  alt: string;
  onClose: () => void;
}

/**
 * 카드 이미지 클릭 시 뜨는 확장 보기. 키보드(←/→/Esc), 백드롭 클릭, 닫기 버튼 지원.
 */
export function JobImageModal({
  open,
  urls,
  initialIndex,
  alt,
  onClose,
}: JobImageModalProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(Math.min(initialIndex, Math.max(0, urls.length - 1)));
  }, [open, initialIndex, urls.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') {
        setIndex((i) => (urls.length === 0 ? 0 : (i - 1 + urls.length) % urls.length));
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => (urls.length === 0 ? 0 : (i + 1) % urls.length));
      }
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, urls.length, onClose]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
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
        />
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
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
