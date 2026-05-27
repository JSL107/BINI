/**
 * "지난 방문 이후 신규 N건" 뱃지가 비교 기준으로 쓰는 baseline 시각 관리.
 *
 * 동작:
 * - 처음 방문 → baseline 없음 → set now, 뱃지 안 보임(처음이라 "신규" 의미 X)
 * - 다음 방문 → 저장된 baseline 이후 firstSeenAt 잡 수를 카운트해 뱃지 표시
 * - 사용자가 "본 걸로 표시" 클릭 → baseline = now → 뱃지 다음 방문부터 0건
 *
 * 의도적으로 baseline을 자동 갱신하지 않는다 — 매 방문마다 갱신하면 뱃지가
 * 항상 0이 되어 무용. 누적식이라 안 봤다면 뱃지 카운트가 커지는 게 정상.
 *
 * 직렬화: ISO 문자열 한 줄. 파싱 실패/누락 시 null 반환.
 */

const STORAGE_KEY = 'bini:visit-baseline-v1';
export const VISIT_BASELINE_CHANGE_EVENT = 'bini:visit-baseline-changed';

export { STORAGE_KEY as VISIT_BASELINE_STORAGE_KEY };

export function loadVisitBaseline(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // ISO 검증: Date.parse가 NaN이면 손상으로 간주.
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function setVisitBaseline(iso: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    // Quota exceeded 등 — 무시. 뱃지 안 보이는 정도라 UX 영향 미미.
  }
  try {
    window.dispatchEvent(new CustomEvent(VISIT_BASELINE_CHANGE_EVENT));
  } catch {
    // 일부 환경 CustomEvent 미지원 — 무시.
  }
}

/** 디버그/테스트용 — baseline 초기화. */
export function clearVisitBaseline(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(VISIT_BASELINE_CHANGE_EVENT));
  } catch {
    // ignore
  }
}
