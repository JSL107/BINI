'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CalendarDay } from '@bini/types';
import { markJobAsSeen } from '../lib/seen-jobs';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 캘린더 4주 그리드 + 마감 셀 hover/탭 popover.
 * - 페이지(server)가 days를 fetch해 props로 전달
 * - hover/탭으로 그 날 마감 공고 미리보기(서버 캡 5건) 노출
 * - popover 안의 각 공고는 새 탭으로 외부 상세 진입 + markJobAsSeen 마킹
 */
export function CalendarGrid({ days }: { days: CalendarDay[] }) {
  // 현재 popover가 열린 셀의 date — null이면 모두 닫힘. 한 번에 하나만 열린다.
  const [openDate, setOpenDate] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 그리드 바깥 클릭 / ESC로 닫기. mouse나 touch 모두 'click' 이벤트로 처리됨.
  useEffect(() => {
    if (openDate === null) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpenDate(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenDate(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openDate]);

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

  // 첫 셀의 요일에 맞춰 leading empty cell 채워 7컬럼 그리드 정렬.
  const firstWd = days.length > 0 ? weekdayIndex(days[0].date) : 0;
  const leading: Array<CalendarDay | null> = Array.from({ length: firstWd }, () => null);
  const cells: Array<CalendarDay | null> = [...leading, ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      ref={rootRef}
      className="overflow-visible rounded-lg border border-gray-200 bg-white shadow-sm"
    >
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
            return (
              <div
                key={`empty-${i}`}
                className="aspect-square border-r border-b border-gray-100 bg-gray-50/30"
              />
            );
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
              isOpen={openDate === cell.date}
              onToggle={() =>
                setOpenDate((prev) => (prev === cell.date ? null : cell.date))
              }
              onHoverOpen={() => {
                // Desktop hover — 다른 셀 popover가 열려 있으면 갈아치움. tap-only 환경은
                // 이 핸들러가 안 불려서 무관.
                if (cell.deadlineCount > 0) setOpenDate(cell.date);
              }}
              onHoverClose={() => {
                if (openDate === cell.date) setOpenDate(null);
              }}
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
  isOpen,
  onToggle,
  onHoverOpen,
  onHoverClose,
}: {
  day: CalendarDay;
  label: string;
  isToday: boolean;
  dim: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onHoverOpen: () => void;
  onHoverClose: () => void;
}) {
  const hasDeadline = day.deadlineCount > 0;

  return (
    <div
      className="relative aspect-square border-r border-b border-gray-100"
      onMouseEnter={hasDeadline ? onHoverOpen : undefined}
      onMouseLeave={hasDeadline ? onHoverClose : undefined}
    >
      <div
        className={`flex h-full flex-col gap-1 p-2 ${
          isToday ? 'ring-2 ring-inset ring-blue-500' : ''
        } ${dim ? 'opacity-60' : ''} ${hasDeadline ? 'hover:bg-blue-50/30' : ''}`}
        title={`${day.date} · 신규 ${day.newCount} · 마감 ${day.deadlineCount}`}
      >
        <div className="flex items-baseline justify-between">
          <span
            className={`text-sm font-semibold ${
              isToday ? 'text-blue-700' : 'text-gray-800'
            }`}
          >
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
          {hasDeadline && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              className="inline-flex w-fit items-center gap-1 rounded text-xs text-red-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              마감 {day.deadlineCount}
            </button>
          )}
        </div>
      </div>

      {isOpen && hasDeadline && <DeadlinePopover day={day} />}
    </div>
  );
}

/**
 * 마감 셀 위로 floating popover. 그 날 마감 공고 미리보기 N건.
 * popover 안의 클릭은 외부로 navigation되며 markJobAsSeen 부수효과.
 */
function DeadlinePopover({ day }: { day: CalendarDay }) {
  const overflow = day.deadlineCount - day.deadlineJobs.length;
  return (
    <div
      role="dialog"
      aria-label={`${day.date} 마감 공고`}
      className="absolute left-1/2 top-full z-30 mt-1 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 text-left shadow-lg"
      // popover 안 hover 동안 셀의 onMouseLeave가 부모에서만 fire되므로 OK.
      // bubbling 막아 셀 클릭 토글이 발화하지 않게.
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1 text-xs font-semibold text-gray-500">
        {day.date} 마감 {day.deadlineCount}건
      </p>
      <ul className="space-y-1">
        {day.deadlineJobs.map((j) => (
          <li key={j.id}>
            <a
              href={j.detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markJobAsSeen(j.id)}
              className="block rounded px-1.5 py-1 hover:bg-gray-50"
            >
              <span className="block truncate text-xs text-gray-500">{j.company}</span>
              <span className="block truncate text-sm text-gray-900">{j.title}</span>
            </a>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <Link
          href="/?sort=deadline-soonest"
          className="mt-1 block rounded px-1.5 py-1 text-xs text-blue-600 hover:underline"
        >
          외 {overflow}건 더 보기 →
        </Link>
      )}
    </div>
  );
}
