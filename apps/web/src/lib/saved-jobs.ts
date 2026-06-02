/**
 * 사용자가 "별" 아이콘으로 스크랩한 공고를 localStorage에 저장한다.
 *
 * "본적있음"(seen-jobs)이 자동 부수효과인 반면 스크랩은 사용자가 명시적으로
 * "이거 다시 보고 싶다"고 선택한 능동적 의도. /saved 페이지에서 모아본다.
 *
 * 저장 모양: { [jobId]: { savedAt, job, note?, status?, updatedAt? } }
 * - job 스냅샷 통째 저장 — /saved 페이지 표시에 추가 API 호출 0
 * - 트레이드오프: 원본이 갱신돼도 스크랩 시점 값 유지. 사용자가 별 다시 누르면 갱신.
 * - note/status는 사용자가 명시적으로 편집한 메타 — 별 토글로 덮이지 않는다.
 *
 * 캡 SAVED_CAP=100 — 100건 × 평균 2KB ≈ 200KB. localStorage 5MB 한도 안에서 안전.
 * 초과 시 savedAt 가장 작은(가장 오래 전에 저장한) 50건(Math.floor(SAVED_CAP/2))을
 * drop. 매번 정렬 비용 회피 — amortized O(1)/저장 호출.
 *
 * 같은 탭 동기화는 'bini:saved-jobs-changed' CustomEvent, 다른 탭은 'storage'.
 */

import type { Job } from '@bini/types';

/** localStorage 키 — 다른 모듈에서 storage 이벤트 매칭에도 사용. */
export const STORAGE_KEY = 'bini:saved-jobs-v1';
const SAVED_CAP = 100;
const NOTE_MAX = 500;
export const SAVED_JOBS_CHANGE_EVENT = 'bini:saved-jobs-changed';

/**
 * 사용자가 카드별로 표시할 수 있는 지원 진행 단계. 5단계는 채용 흐름의 표준 컷.
 * `considering`이 디폴트(미설정 시) — 별 누른 시점엔 아직 "검토중".
 */
export type SavedApplicationStatus =
  | 'considering'
  | 'applied'
  | 'interview'
  | 'rejected'
  | 'offered';

// Object.freeze로 런타임 mutate 차단 — `isValidStatus`/필터 카운트가 이 배열을
// 직접 참조하므로 외부에서 push/pop 당하면 정합성이 깨진다.
export const SAVED_APPLICATION_STATUSES: readonly SavedApplicationStatus[] =
  Object.freeze([
    'considering',
    'applied',
    'interview',
    'rejected',
    'offered',
  ] as const);

export const SAVED_APPLICATION_STATUS_LABELS: Record<SavedApplicationStatus, string> = {
  considering: '검토중',
  applied: '지원',
  interview: '면접',
  rejected: '탈락',
  offered: '합격',
};

function isValidStatus(s: unknown): s is SavedApplicationStatus {
  return (
    typeof s === 'string' &&
    (SAVED_APPLICATION_STATUSES as readonly string[]).includes(s)
  );
}

export interface SavedEntry {
  /** 사용자가 스크랩한 시각 (ms). LRU 정렬·노출 정렬 기준. */
  savedAt: number;
  job: Job;
  /** 사용자 자유 메모. trim 후 500자 cap. 빈 문자열이면 키 제거. */
  note?: string;
  /** 지원 진행 단계. 미설정 = 'considering' 의미. */
  status?: SavedApplicationStatus;
  /** note/status 최근 변경 시각(ms). LRU와 무관 — 표시·정렬용. */
  updatedAt?: number;
}

type SavedMap = Record<string, SavedEntry>;

/** SSR-safe load. window 없으면 빈 객체. 손상된 JSON/배열/null도 빈 객체로 폴백. */
export function loadSavedJobs(): SavedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SavedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as {
        savedAt?: unknown;
        job?: unknown;
        note?: unknown;
        status?: unknown;
        updatedAt?: unknown;
      };
      if (typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) continue;
      if (!entry.job || typeof entry.job !== 'object') continue;
      // 최소 Job 식별 필드만 검증 — id 일치 + 문자열.
      const j = entry.job as Partial<Job>;
      if (typeof j.id !== 'string' || j.id !== k) continue;
      const safe: SavedEntry = { savedAt: entry.savedAt, job: entry.job as Job };
      if (typeof entry.note === 'string' && entry.note.length > 0) {
        safe.note = entry.note.slice(0, NOTE_MAX);
      }
      if (isValidStatus(entry.status)) {
        safe.status = entry.status;
      }
      if (
        typeof entry.updatedAt === 'number' &&
        Number.isFinite(entry.updatedAt)
      ) {
        safe.updatedAt = entry.updatedAt;
      }
      out[k] = safe;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 공고 한 건을 스크랩. 같은 ID가 이미 있으면 savedAt만 갱신, job은 새 값으로 덮어쓰기.
 * note/status는 보존 — 별 토글로 사용자 편집한 메타가 날아가지 않도록.
 * 반환값: 실제 localStorage 쓰기 성공 여부. QuotaExceeded 등으로 실패 시 false →
 * 호출자(SaveJobButton)가 UI를 낙관적으로 토글하지 않게 한다.
 */
export function saveJob(job: Job): boolean {
  if (typeof window === 'undefined') return false;
  if (!job || !job.id) return false;
  const current = loadSavedJobs();
  const prev = current[job.id];
  current[job.id] = {
    savedAt: Date.now(),
    job,
    ...(prev?.note ? { note: prev.note } : {}),
    ...(prev?.status ? { status: prev.status } : {}),
    ...(prev?.updatedAt ? { updatedAt: prev.updatedAt } : {}),
  };

  const keys = Object.keys(current);
  if (keys.length > SAVED_CAP) {
    // LRU drop — 메타(note/status)가 있는 entry는 사용자 직접 입력이라 silently
    // 손실되지 않도록 drop 후순위로 둔다. 메타 없는 entry부터 savedAt asc로,
    // 그 후 메타 있는 entry도 savedAt asc로 — 결과적으로 메타 없는 oldest →
    // 메타 있는 oldest 순으로 50건(Math.floor(100/2)) drop.
    const sorted = keys
      .map((k) => {
        const e = current[k];
        const hasMeta = Boolean(e.note || e.status);
        return [k, e.savedAt, hasMeta] as const;
      })
      .sort((a, b) => {
        if (a[2] !== b[2]) return a[2] ? 1 : -1;
        return a[1] - b[1];
      });
    const drop = sorted.slice(0, Math.floor(SAVED_CAP / 2));
    for (const [k] of drop) delete current[k];
  }

  return persist(current);
}

/**
 * 한 건 unscrap. ID 없거나 무관한 ID여도 no-op으로 true 반환(이미 안 저장된 상태).
 * 실제 삭제했는데 persist 실패 시 false. note/status도 같이 사라짐(스크랩 해제 시
 * 사용자 메타도 자연 정리되는 의도 — 다시 스크랩하면 빈 상태로 시작).
 */
export function unsaveJob(jobId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!jobId) return true;
  const current = loadSavedJobs();
  if (!(jobId in current)) return true;
  delete current[jobId];
  return persist(current);
}

/**
 * 이미 스크랩된 잡의 note/status를 갱신. 미저장 잡엔 적용하지 않고 false 반환
 * (메타 없이 entry만 생성하는 부수효과 회피).
 *
 * patch에 키가 없으면 해당 필드는 건드리지 않음. 키는 있지만 빈 문자열/null이면
 * 필드를 삭제(undefined로) — UI에서 "메모 비우기"/"상태 미설정"을 표현.
 */
export function updateSavedJobMeta(
  jobId: string,
  patch: { note?: string | null; status?: SavedApplicationStatus | null },
): boolean {
  if (typeof window === 'undefined') return false;
  if (!jobId) return false;
  const current = loadSavedJobs();
  const entry = current[jobId];
  if (!entry) return false;

  const next: SavedEntry = { ...entry, updatedAt: Date.now() };
  if ('note' in patch) {
    const raw = (patch.note ?? '').trim().slice(0, NOTE_MAX);
    if (raw.length > 0) next.note = raw;
    else delete next.note;
  }
  if ('status' in patch) {
    if (patch.status && isValidStatus(patch.status)) {
      next.status = patch.status;
    } else {
      delete next.status;
    }
  }
  current[jobId] = next;
  return persist(current);
}

export function isJobSaved(map: SavedMap, jobId: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, jobId);
}

/** savedAt desc로 정렬한 entry 배열 — /saved 페이지가 그대로 렌더. */
export function listSavedJobsByRecent(map: SavedMap): SavedEntry[] {
  return Object.values(map).sort((a, b) => b.savedAt - a.savedAt);
}

/** 디버그/테스트용. */
export function clearSavedJobs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notifyChange();
}

/**
 * localStorage 쓰기 + 같은 탭 알림. SSR 환경 호출 시 false 반환(no-op).
 * QuotaExceeded 등으로 setItem 실패 시 false — 호출자가 UI 낙관 토글을 피한다.
 * 이벤트 발행은 쓰기 성공 시에만(반대 상태 알리는 잘못된 트리거 방지).
 */
function persist(map: SavedMap): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    return false;
  }
  notifyChange();
  return true;
}

function notifyChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(SAVED_JOBS_CHANGE_EVENT));
  } catch {
    // 일부 환경 CustomEvent 미지원 — 무시.
  }
}
