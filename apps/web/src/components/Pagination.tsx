import Link from 'next/link';

function buildHref(
  page: number,
  search?: string,
  extraQuery?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('q', search);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      if (v) params.set(k, v);
    }
  }
  return `/?${params.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  search,
  extraQuery,
}: {
  page: number;
  totalPages: number;
  search?: string;
  /** 페이지 링크에 보존할 추가 쿼리(필터 등). undefined/빈 값은 자동 제외. */
  extraQuery?: Record<string, string | undefined>;
}) {
  return (
    <nav className="flex items-center justify-center gap-4 py-6">
      {page > 1 && (
        <Link
          href={buildHref(page - 1, search, extraQuery)}
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
          href={buildHref(page + 1, search, extraQuery)}
          className="rounded border px-3 py-1 hover:bg-gray-50"
        >
          다음
        </Link>
      )}
    </nav>
  );
}
