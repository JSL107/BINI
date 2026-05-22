'use client';

// Next.js 16 error boundary: the retry prop is `unstable_retry` (was `reset` in v15).
export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="mb-4 text-gray-700">공고를 불러오지 못했습니다.</p>
      <button
        onClick={() => unstable_retry()}
        className="rounded border px-4 py-2 hover:bg-gray-50"
      >
        다시 시도
      </button>
    </main>
  );
}
