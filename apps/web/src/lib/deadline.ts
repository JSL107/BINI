/**
 * 잡 마감일 텍스트("상시" · "채용시" · "04/03(금)" · "2026-04-03" 등)를 파싱해
 * 사용자에게 보여줄 상태와 D-day(daysRemaining)를 계산한다.
 *
 * 원본 텍스트는 사이트마다 들쭉날쭉이라(게임잡/사라민/잡코리아…) 보수적으로
 * 인식 가능한 패턴만 'parsed' / 'expired'로 분류하고 나머지는 'unknown'.
 *
 * - 'always'    : 상시/수시/채용시 — 마감 무한
 * - 'parsed'    : 미래 마감 (daysRemaining ≥ 0)
 * - 'expired'   : 과거 마감 (daysRemaining < 0)
 * - 'unknown'   : 텍스트 무관 또는 파싱 실패
 */
export interface DeadlineStatus {
  kind: 'always' | 'parsed' | 'expired' | 'unknown';
  daysRemaining?: number;
  date?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDeadline(
  text: string | null | undefined,
  now: Date = new Date(),
): DeadlineStatus {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { kind: 'unknown' };

  // 상시/수시/채용시 등 무한 마감 — 게임잡 표기 다수.
  if (isAlwaysText(trimmed)) return { kind: 'always' };

  // YYYY-MM-DD 우선 매칭 (가장 명확).
  const ym = trimmed.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (ym) {
    const year = parseInt(ym[1], 10);
    const month = parseInt(ym[2], 10);
    const day = parseInt(ym[3], 10);
    return classify(year, month, day, now);
  }

  // MM/DD 또는 MM.DD 또는 M월 D일 패턴 — 연도가 없으면 추정.
  const md =
    trimmed.match(/(\d{1,2})[\/.](\d{1,2})/) ??
    trimmed.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const month = parseInt(md[1], 10);
    const day = parseInt(md[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return { kind: 'unknown' };
    const currentYear = now.getFullYear();
    const date = new Date(currentYear, month - 1, day, 23, 59, 59);
    // 30일 이상 과거면 데이터가 오래된 잡으로 보고 unknown — 같은 MM/DD가
    // 다음 해 미래로 자동 추정되면 "1월 31일에 만난 12/31 잡"이 다음 해
    // 12월로 잡혀 D-day 양수로 오인식되는 회귀(codex 합의)를 방지한다.
    if (date.getTime() < now.getTime() - 30 * MS_PER_DAY) {
      return { kind: 'unknown' };
    }
    return finalize(date, now);
  }

  return { kind: 'unknown' };
}

function classify(
  year: number,
  month: number,
  day: number,
  now: Date,
): DeadlineStatus {
  if (month < 1 || month > 12 || day < 1 || day > 31) return { kind: 'unknown' };
  const date = new Date(year, month - 1, day, 23, 59, 59);
  return finalize(date, now);
}

function finalize(date: Date, now: Date): DeadlineStatus {
  const daysRemaining = Math.floor((date.getTime() - now.getTime()) / MS_PER_DAY);
  if (daysRemaining < 0) return { kind: 'expired', daysRemaining, date };
  return { kind: 'parsed', daysRemaining, date };
}

/**
 * UI 뱃지 레벨 — 카드/모달에서 색상 결정용.
 *   - 'urgent'  : 3일 이내 마감 (빨강)
 *   - 'soon'    : 4-7일 (주황)
 *   - 'normal'  : 8일 이상 (뱃지 없음)
 *   - 'expired' : 이미 마감
 *   - 'always'  : 상시
 *   - 'unknown' : 파싱 불가
 */
export type DeadlineBadge =
  | 'urgent'
  | 'soon'
  | 'normal'
  | 'expired'
  | 'always'
  | 'unknown';

export function deadlineBadge(status: DeadlineStatus): DeadlineBadge {
  if (status.kind === 'always') return 'always';
  if (status.kind === 'expired') return 'expired';
  if (status.kind === 'unknown') return 'unknown';
  const d = status.daysRemaining ?? 0;
  if (d <= 3) return 'urgent';
  if (d <= 7) return 'soon';
  return 'normal';
}

function isAlwaysText(s: string): boolean {
  return /상시|수시|채용\s*시/.test(s);
}

/**
 * 서버가 cron 시점에 파싱해둔 `deadlineAt`(ISO 문자열)을 우선 사용해 상태를 만든다.
 * 서버 값이 null이면 원본 `deadline` 텍스트를 클라이언트 측에서 재파싱한다.
 *
 * 사용 이유: cron이 본 시점과 사용자가 본 시점이 다를 수 있으나, 정확도는 클라이언트
 * 재파싱보다 서버가 보유한 (그리고 정렬·필터에 동일하게 쓰인) Date가 더 신뢰 가능.
 * 클라이언트 재파싱은 서버 컬럼이 NULL("상시"/파싱불가)인 경우의 폴백으로만 사용.
 */
export function deadlineStatusFromJob(
  job: { deadline?: string | null; deadlineAt?: string | null },
  now: Date = new Date(),
): DeadlineStatus {
  if (job.deadlineAt) {
    const t = Date.parse(job.deadlineAt);
    if (!Number.isNaN(t)) {
      return finalize(new Date(t), now);
    }
  }
  // 서버가 deadlineAt을 null로 둔 경우:
  //  1) "상시"라서 의도된 null — 'always'로 분류.
  //  2) 파싱 실패 — 클라이언트 측 폴백 파싱 시도(과거에 잘 동작하던 텍스트도 있어 의미 있음).
  const trimmed = (job.deadline ?? '').trim();
  if (!trimmed) return { kind: 'unknown' };
  if (isAlwaysText(trimmed)) return { kind: 'always' };
  return parseDeadline(trimmed, now);
}
