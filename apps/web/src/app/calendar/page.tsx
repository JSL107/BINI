import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchCalendar } from '../../lib/api';
import { CalendarGrid } from '../../components/CalendarGrid';

export const metadata: Metadata = {
  title: '캘린더 · BINI',
  description:
    '이번 주부터 4주간의 신규 등록·마감 공고를 한 화면에서. 마감 셀에 hover하면 그 날 마감 공고 목록을 바로 노출.',
};

// 1분 ISR — cron 갱신 3h 주기에 비해 충분히 신선.
export const revalidate = 60;

export default async function CalendarPage() {
  let data: Awaited<ReturnType<typeof fetchCalendar>> | null = null;
  try {
    data = await fetchCalendar(4);
  } catch {
    data = null;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/" className="text-gray-600 hover:text-gray-900 hover:underline">
          공고 목록
        </Link>
        <Link href="/companies" className="text-gray-600 hover:text-gray-900 hover:underline">
          회사 채용 페이지
        </Link>
        <Link href="/stats" className="text-gray-600 hover:text-gray-900 hover:underline">
          통계
        </Link>
        <Link href="/portfolio" className="text-gray-600 hover:text-gray-900 hover:underline">
          포트폴리오
        </Link>
        <span className="font-semibold text-gray-900">캘린더</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">이번 주 + 향후 4주</h1>
        <p className="mt-2 text-sm text-gray-600">
          파란 점은 그날 새로 들어온 공고 수, 빨간 점은 그날 마감인 공고 수.
          마감 셀에 마우스를 올리거나 탭하면 그 날 마감 공고 목록이 바로 뜹니다.
        </p>
      </header>

      {!data ? (
        <p className="text-gray-500">캘린더를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
      ) : (
        <CalendarGrid days={data.days} />
      )}

      <section className="mt-8 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <Legend color="bg-blue-500" label="신규 등록" />
        <Legend color="bg-red-500" label="마감 예정" />
        <span className="text-gray-400">데이터 1분 캐시</span>
      </section>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
