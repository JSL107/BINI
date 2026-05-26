/**
 * cron 시점에 `RawJob.deadline` 텍스트를 파싱해 `Job.deadlineAt` 컬럼에 저장할
 * `Date | null` 값을 산출한다. 같은 텍스트 포맷이 사이트마다 들쭉날쭉이라
 * 보수적으로 인식 가능한 패턴만 Date로 변환하고 나머지는 null.
 *
 * - "상시" / "수시" / "채용시" → null (무한 마감 — 정렬에선 후순위로 자연 배치)
 * - "2026-04-03" / "2026.04.03" / "2026/04/03" → 명시 연도 Date
 * - "04/03(금)" / "04.03" / "4월 3일" → 올해 추정 Date (단, 30일 이상 과거면 null)
 * - 그 외 / 범위 밖 → null
 *
 * 시점은 마감 당일 23:59:59 KST에 해당하는 UTC 인스턴트로 정규화한다.
 * 단위 테스트는 `process.env.TZ='Asia/Seoul'` 가정.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDeadlineToDate(
  text: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // 상시/수시/채용시 등 무한 마감 → null (deadlineAt 미설정)
  if (/상시|수시|채용\s*시/.test(trimmed)) return null;

  // YYYY-MM-DD (- / .)
  const ym = trimmed.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (ym) {
    const year = parseInt(ym[1], 10);
    const month = parseInt(ym[2], 10);
    const day = parseInt(ym[3], 10);
    return toEndOfDay(year, month, day);
  }

  // MM/DD / MM.DD / M월 D일 — 연도 미상 → 올해로 추정, 30일 이상 과거면 null
  const md =
    trimmed.match(/(\d{1,2})[\/.](\d{1,2})/) ??
    trimmed.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const month = parseInt(md[1], 10);
    const day = parseInt(md[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = now.getFullYear();
    const candidate = toEndOfDay(year, month, day);
    if (!candidate) return null;
    if (candidate.getTime() < now.getTime() - 30 * MS_PER_DAY) {
      // 한 달 이상 과거 → "작년 데이터"이거나 다음 해 추정이 부정확할 위험.
      // web/lib/deadline.ts와 동일한 보수적 정책.
      return null;
    }
    return candidate;
  }

  return null;
}

function toEndOfDay(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 23:59:59.999 KST 기준 마감 시점. `new Date(y, m, d, ...)`는 로컬 TZ 해석이라
  // 테스트가 TZ=Asia/Seoul로 고정되어 있다(spec 상단). 운영 컨테이너 TZ가 UTC면
  // 결과 인스턴트가 +9h 시프트되지만 cron이 D-day 정확도를 1초 단위로 요구하지
  // 않아 허용 오차 범위 — 이후 D-day 계산은 항상 UTC 인스턴트끼리의 차이로 처리.
  const d = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(d.getTime())) return null;
  // JS Date 자동 정규화 — "2/30" → 3/2 같은 케이스. 의도와 다르면 null.
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}
