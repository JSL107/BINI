import Link from 'next/link';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <nav className="flex items-center justify-center gap-4 py-6">
      {page > 1 && (
        <Link
          href={`/?page=${page - 1}`}
          className="rounded border px-3 py-1 hover:bg-gray-50"
        >
          이전
        </Link>
      )}
      <span className="text-sm text-gray-600">
        {page} / {totalPages}
      </span>
      {page < totalPages && (
        <Link
          href={`/?page=${page + 1}`}
          className="rounded border px-3 py-1 hover:bg-gray-50"
        >
          다음
        </Link>
      )}
    </nav>
  );
}
