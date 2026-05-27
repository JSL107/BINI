import type { Metadata } from 'next';
import Link from 'next/link';
import type { CalendarDay } from '@bini/types';
import { fetchCalendar } from '../../lib/api';

export const metadata: Metadata = {
  title: '캘린더 · BINI',
  description:
    '이번 주부터 4주간의 신규 등록·마감 공고를 한 화면에서. 마감 임박 셀을 클릭하면 그날 마감 공고로 점프.',
};

// 1분 ISR — cron 갱신 3h 주기에 비해 충분히 신선.
export const revalidate = 60;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

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
          마감일 칸을 클릭하면 마감 임박순으로 정렬된 공고 목록으로 이동합니다.
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

function CalendarGrid({ days }: { days: CalendarDay[] }) {
  // 'YYYY-MM-DD' → 요일 인덱스(0=일). KST 일자라 UTC parsing 시 시차 영향이 없도록
  // 직접 split해서 Date(UTC midnight)로 만들면 getUTCDay()가 일정.
  function weekdayIndex(iso: string): number {
    const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  function dayLabel(iso: string): string {
    const [, m, d] = iso.split('-').map((s) => parseInt(s, 10));
    return `${m}/${d}`;
  }

  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 첫 셀의 요일에 따라 leading empty cell을 채워 월~일(여기선 일~토) 그리드에 맞춤.
  const firstWd = days.length > 0 ? weekdayIndex(days[0].date) : 0;
  const leading: Array<CalendarDay | null> = Array.from({ length: firstWd }, () => null);
  const cells: Array<CalendarDay | null> = [...leading, ...days];
  // 7로 떨어지도록 trailing padding.
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-500">
        {WEEKDAY_LABELS.map((wd, i) => (
          <div
            key={wd}
            className={`py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}`}
          >
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="aspect-square border-r border-b border-gray-100 bg-gray-50/30" />;
          }
          const isToday = cell.date === todayIso;
          const empty = cell.newCount === 0 && cell.deadlineCount === 0;
          return (
            <DayCell
              key={cell.date}
              day={cell}
              label={dayLabel(cell.date)}
              isToday={isToday}
              dim={empty}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  day,
  label,
  isToday,
  dim,
}: {
  day: CalendarDay;
  label: string;
  isToday: boolean;
  dim: boolean;
}) {
  // 마감이 있는 칸은 deadline-soonest 정렬로 이동(그날 마감 잡들이 상단에 노출).
  const linkHref = day.deadlineCount > 0 ? `/?sort=deadline-soonest` : null;
  const inner = (
    <div
      className={`flex h-full flex-col gap-1 p-2 ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''} ${dim ? 'opacity-60' : ''}`}
      title={`${day.date} · 신규 ${day.newCount} · 마감 ${day.deadlineCount}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>
          {label}
        </span>
        {isToday && (
          <span className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-700">
            오늘
          </span>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-0.5">
        {day.newCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            신규 {day.newCount}
          </span>
        )}
        {day.deadlineCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            마감 {day.deadlineCount}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="aspect-square border-r border-b border-gray-100">
      {linkHref ? (
        <Link href={linkHref} className="block h-full hover:bg-blue-50/50">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
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
