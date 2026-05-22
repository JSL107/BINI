const UNIT_MS: Record<string, number> = {
  분: 60_000,
  시간: 3_600_000,
  일: 86_400_000,
  주: 604_800_000,
};

/**
 * 게임잡 목록의 상대 등록시간 텍스트("N시간 전 등록" 등)를 절대 시각으로 변환한다.
 * 해석 불가 시 now를 그대로 반환한다(best-effort).
 */
export function parseRelativeTime(text: string, now: Date = new Date()): Date {
  const m = text.match(/(\d+)\s*(분|시간|일|주)\s*전/);
  if (m) {
    const amount = parseInt(m[1], 10);
    return new Date(now.getTime() - amount * UNIT_MS[m[2]]);
  }
  return new Date(now.getTime());
}
