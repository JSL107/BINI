const UNIT_MS: Record<string, number> = {
  분: 60_000,
  시간: 3_600_000,
  일: 86_400_000,
  주: 604_800_000,
  개월: 30 * 86_400_000,
  년: 365 * 86_400_000,
};

/**
 * 게임잡 목록의 상대 등록시간 텍스트를 절대 시각으로 변환한다 (best-effort).
 * - "N분/시간/일/주/개월/년 전" → 계산된 절대 시각
 * - "방금 전" → now
 * - 해석 불가 → epoch(1970): 등록일순(내림차순) 정렬에서 맨 뒤로 가도록 한다
 *   (해석 불가를 now로 두면 오래된/깨진 공고가 목록 최상단으로 떠 정렬이 망가짐).
 *
 * 루프에서 여러 공고에 같은 기준 시각을 쓰려면 호출 전에 now를 만들어 인자로 전달할 것.
 */
export function parseRelativeTime(text: string, now: Date = new Date()): Date {
  const m = text.match(/(\d+)\s*(분|시간|일|주|개월|년)\s*전/);
  if (m) {
    const amount = parseInt(m[1], 10);
    return new Date(now.getTime() - amount * UNIT_MS[m[2]]);
  }
  if (text.includes('방금')) {
    return new Date(now.getTime());
  }
  return new Date(0);
}
