'use client';

import { useEffect, useRef, useState } from 'react';
import type { Job } from '@bini/types';
import {
  SAVED_APPLICATION_STATUSES,
  SAVED_APPLICATION_STATUS_LABELS,
  type SavedApplicationStatus,
  updateSavedJobMeta,
} from '../lib/saved-jobs';

/**
 * /saved 페이지 카드 아래에 inline으로 붙는 메타 편집기.
 * - 5단계 상태 chip — 클릭 즉시 저장
 * - 메모 textarea — blur 시 저장 (debounce 안 씀, 사용자가 명시적으로 빠져나갈 때 커밋)
 * - 변경은 `updateSavedJobMeta`로 localStorage에 반영 → /saved 페이지의
 *   `useSyncExternalStore` 구독이 자동 리렌더.
 *
 * 컴포넌트 자체는 controlled — entry의 note/status가 source of truth지만
 * 입력 중 사용자 키스트로크는 로컬 state로만 받아두고 blur/클릭 시 commit.
 */
const STATUS_CHIP_COLOR: Record<SavedApplicationStatus, string> = {
  considering: 'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200',
  applied: 'bg-sky-100 text-sky-700 ring-sky-200 hover:bg-sky-200',
  interview: 'bg-violet-100 text-violet-700 ring-violet-200 hover:bg-violet-200',
  rejected: 'bg-rose-100 text-rose-700 ring-rose-200 hover:bg-rose-200',
  offered: 'bg-emerald-100 text-emerald-700 ring-emerald-200 hover:bg-emerald-200',
};
const STATUS_CHIP_ACTIVE: Record<SavedApplicationStatus, string> = {
  considering: 'bg-gray-700 text-white ring-gray-700',
  applied: 'bg-sky-600 text-white ring-sky-600',
  interview: 'bg-violet-600 text-white ring-violet-600',
  rejected: 'bg-rose-600 text-white ring-rose-600',
  offered: 'bg-emerald-600 text-white ring-emerald-600',
};

export interface SavedJobMetaEditorProps {
  job: Job;
  note: string | undefined;
  status: SavedApplicationStatus | undefined;
}

export function SavedJobMetaEditor({ job, note, status }: SavedJobMetaEditorProps) {
  // 로컬 입력 버퍼 — 외부 entry 갱신과 입력 도중 충돌 회피.
  const [draft, setDraft] = useState(note ?? '');
  const lastCommittedRef = useRef(note ?? '');

  // 외부에서 note가 바뀌면(다른 탭/다른 컴포넌트 동기화) 입력 중이 아닐 때만 동기화.
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setDraft(note ?? '');
      lastCommittedRef.current = note ?? '';
    }
  }, [note]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function commitNote() {
    if (draft === lastCommittedRef.current) return;
    updateSavedJobMeta(job.id, { note: draft });
    lastCommittedRef.current = draft;
  }

  function pickStatus(next: SavedApplicationStatus) {
    // 같은 chip을 다시 누르면 미설정으로 되돌리는 토글.
    const value = status === next ? null : next;
    updateSavedJobMeta(job.id, { status: value });
  }

  const currentStatus: SavedApplicationStatus = status ?? 'considering';

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {SAVED_APPLICATION_STATUSES.map((s) => {
          const active = currentStatus === s;
          const cls = active ? STATUS_CHIP_ACTIVE[s] : STATUS_CHIP_COLOR[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => pickStatus(s)}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${cls}`}
            >
              {SAVED_APPLICATION_STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>
      <label className="sr-only" htmlFor={`note-${job.id}`}>
        메모
      </label>
      <textarea
        id={`note-${job.id}`}
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 500))}
        onBlur={commitNote}
        placeholder="메모 (예: 1차 면접 6/5, 포트폴리오 보강 필요)"
        rows={2}
        maxLength={500}
        className="w-full resize-y rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
      {draft.length > 0 && (
        <p className="mt-1 text-[10px] text-gray-400">
          {draft.length}/500 · 포커스 밖으로 나가면 저장
        </p>
      )}
    </div>
  );
}
