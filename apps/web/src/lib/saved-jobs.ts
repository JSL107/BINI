/**
 * 사용자가 "별" 아이콘으로 스크랩한 공고를 localStorage에 저장한다.
 *
 * "본적있음"(seen-jobs)이 자동 부수효과인 반면 스크랩은 사용자가 명시적으로
 * "이거 다시 보고 싶다"고 선택한 능동적 의도. /saved 페이지에서 모아본다.
 *
 * 저장 모양: { [jobId]: { savedAt: epochMs, job: Job } }
 * - job 스냅샷 통째 저장 — /saved 페이지 표시에 추가 API 호출 0
 * - 트레이드오프: 원본이 갱신돼도 스크랩 시점 값 유지. 사용자가 별 다시 누르면 갱신.
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
export const SAVED_JOBS_CHANGE_EVENT = 'bini:saved-jobs-changed';

export interface SavedEntry {
  /** 사용자가 스크랩한 시각 (ms). LRU 정렬·노출 정렬 기준. */
  savedAt: number;
  job: Job;
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
      const entry = v as { savedAt?: unknown; job?: unknown };
      if (typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) continue;
      if (!entry.job || typeof entry.job !== 'object') continue;
      // 최소 Job 식별 필드만 검증 — id 일치 + 문자열.
      const j = entry.job as Partial<Job>;
      if (typeof j.id !== 'string' || j.id !== k) continue;
      out[k] = { savedAt: entry.savedAt, job: entry.job as Job };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 공고 한 건을 스크랩. 같은 ID가 이미 있으면 savedAt만 갱신, job은 새 값으로 덮어쓰기.
 * 반환값: 실제 localStorage 쓰기 성공 여부. QuotaExceeded 등으로 실패 시 false →
 * 호출자(SaveJobButton)가 UI를 낙관적으로 토글하지 않게 한다.
 */
export function saveJob(job: Job): boolean {
  if (typeof window === 'undefined') return false;
  if (!job || !job.id) return false;
  const current = loadSavedJobs();
  current[job.id] = { savedAt: Date.now(), job };

  const keys = Object.keys(current);
  if (keys.length > SAVED_CAP) {
    // LRU drop — savedAt asc(가장 오래 전 저장)부터 50건(Math.floor(100/2)) drop.
    const sorted = keys
      .map((k) => [k, current[k].savedAt] as const)
      .sort((a, b) => a[1] - b[1]);
    const drop = sorted.slice(0, Math.floor(SAVED_CAP / 2));
    for (const [k] of drop) delete current[k];
  }

  return persist(current);
}

/**
 * 한 건 unscrap. ID 없거나 무관한 ID여도 no-op으로 true 반환(이미 안 저장된 상태).
 * 실제 삭제했는데 persist 실패 시 false.
 */
export function unsaveJob(jobId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!jobId) return true;
  const current = loadSavedJobs();
  if (!(jobId in current)) return true;
  delete current[jobId];
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
