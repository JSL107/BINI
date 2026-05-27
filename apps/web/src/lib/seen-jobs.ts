/**
 * 사용자가 카드의 상세 링크를 클릭한 적 있는 잡 ID를 localStorage에 누적해두고,
 * 그 카드 이미지 위에 "본적있음" 초록 뱃지를 띄운다.
 *
 * 목적: 매일 들어와서 같은 카드를 다시 훑는 비용을 줄이고, "오늘 신규로 들어온
 * 카드"가 자연스럽게 눈에 띄게 함.
 *
 * 직렬화 모양: { [jobId]: epochMs }. epochMs는 가장 최근에 본 시각.
 * 캡 SEEN_CAP 초과 시 epochMs 작은(=가장 오랫동안 다시 안 본) 항목부터 절반 drop
 * — LRU(least recently used) 정책.
 *
 * 같은 탭의 다른 컴포넌트엔 'storage' 이벤트가 안 와서 custom 이벤트 추가 발행.
 */

/** localStorage 키 — 다른 모듈(JobCard의 'storage' 이벤트 핸들러)도 import해서 참조. */
export const STORAGE_KEY = 'bini:seen-jobs-v1';
const SEEN_CAP = 2000;
export const SEEN_JOBS_CHANGE_EVENT = 'bini:seen-jobs-changed';

type SeenMap = Record<string, number>;

/** SSR-safe load. window 없으면 빈 객체. JSON 파싱 실패도 빈 객체로 폴백(자동 복구). */
export function loadSeenJobs(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // 값 정합성 — 숫자가 아닌 것은 drop.
      const out: SeenMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

/** 한 잡을 '본 적'으로 마킹. 이미 있으면 timestamp 갱신(가장 최근 본 시각). */
export function markJobAsSeen(jobId: string): void {
  if (typeof window === 'undefined') return;
  if (!jobId) return;
  const current = loadSeenJobs();
  current[jobId] = Date.now();

  // LRU 캡 — 항목 수가 상한을 넘으면 가장 오래된 (epochMs 작은) 절반을 비운다.
  // 매번 정렬하지 말고 초과 시에만. 절반 비우기는 amortized O(1).
  const keys = Object.keys(current);
  if (keys.length > SEEN_CAP) {
    const sorted = keys
      .map((k) => [k, current[k]] as const)
      .sort((a, b) => a[1] - b[1]);
    const drop = sorted.slice(0, Math.floor(SEEN_CAP / 2));
    for (const [k] of drop) delete current[k];
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // QuotaExceeded 등 — 조용히 무시. UX엔 영향 없음.
  }
  try {
    window.dispatchEvent(new CustomEvent(SEEN_JOBS_CHANGE_EVENT));
  } catch {
    // 일부 환경에서 CustomEvent 미지원 — 무시.
  }
}

/** Map 키 존재 여부. */
export function isJobSeen(map: SeenMap, jobId: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, jobId);
}

/** 디버그/테스트용 — 전체 클리어. */
export function clearSeenJobs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(SEEN_JOBS_CHANGE_EVENT));
  } catch {
    // ignore
  }
}
