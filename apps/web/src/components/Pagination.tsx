import Link from 'next/link';

function buildHref(page: number, search?: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('q', search);
  return `/?${params.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  search,
}: {
  page: number;
  totalPages: number;
  search?: string;
}) {
  return (
    <nav className="flex items-center justify-center gap-4 py-6">
      {page > 1 && (
        <Link
          href={buildHref(page - 1, search)}
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
          href={buildHref(page + 1, search)}
          className="rounded border px-3 py-1 hover:bg-gray-50"
        >
          다음
        </Link>
      )}
    </nav>
  );
}
