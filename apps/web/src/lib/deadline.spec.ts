import { deadlineBadge, parseDeadline } from './deadline';

// spec 안에서 Date 생성이 시스템 TZ에 따라 흔들리지 않도록 KST 고정 (omc 합의).
process.env.TZ = 'Asia/Seoul';

const NOW = new Date('2026-05-24T12:00:00+09:00');

describe('parseDeadline', () => {
  it('빈/공백/undefined는 unknown', () => {
    expect(parseDeadline('', NOW).kind).toBe('unknown');
    expect(parseDeadline('   ', NOW).kind).toBe('unknown');
    expect(parseDeadline(null, NOW).kind).toBe('unknown');
    expect(parseDeadline(undefined, NOW).kind).toBe('unknown');
  });

  it('상시/수시/채용시는 always', () => {
    expect(parseDeadline('상시', NOW).kind).toBe('always');
    expect(parseDeadline('수시', NOW).kind).toBe('always');
    expect(parseDeadline('채용시', NOW).kind).toBe('always');
    expect(parseDeadline('채용 시', NOW).kind).toBe('always');
    expect(parseDeadline('상시 채용', NOW).kind).toBe('always');
  });

  it('YYYY-MM-DD 미래 마감을 parsed로 분류', () => {
    const r = parseDeadline('2026-06-01', NOW);
    expect(r.kind).toBe('parsed');
    expect(r.daysRemaining).toBe(8);
  });

  it('YYYY-MM-DD 과거 마감을 expired로 분류', () => {
    const r = parseDeadline('2026-05-01', NOW);
    expect(r.kind).toBe('expired');
    expect(r.daysRemaining).toBeLessThan(0);
  });

  it('MM/DD 미래 마감 (같은 해)', () => {
    const r = parseDeadline('06/01(월)', NOW);
    expect(r.kind).toBe('parsed');
    expect(r.daysRemaining).toBe(8);
  });

  it('MM/DD 과거(같은 해, 30일 이내)는 expired로 처리 — 연도 추정 보수적', () => {
    const r = parseDeadline('05/10(일)', NOW); // 14일 전
    expect(r.kind).toBe('expired');
  });

  it('MM/DD 한 달 이상 과거인 잡은 unknown (작년 데이터 잘못 살아남았을 위험 회피)', () => {
    // 같은 해 1/10은 4달 전 — 자동으로 다음 해(내년 1/10)로 올리면 마감 임박
    // 아닌 잡이 D-200대로 표시되는 회귀가 있어 보수적으로 unknown 반환.
    const r = parseDeadline('01/10(토)', NOW);
    expect(r.kind).toBe('unknown');
  });

  it('한글 표기 "5월 30일"도 인식', () => {
    const r = parseDeadline('5월 30일까지', NOW);
    expect(r.kind).toBe('parsed');
    expect(r.daysRemaining).toBe(6);
  });

  it('범위 밖 날짜는 unknown', () => {
    expect(parseDeadline('13/45', NOW).kind).toBe('unknown');
    expect(parseDeadline('99/99', NOW).kind).toBe('unknown');
  });

  it('완전히 모르는 텍스트는 unknown', () => {
    expect(parseDeadline('내일까지', NOW).kind).toBe('unknown');
    expect(parseDeadline('이번주', NOW).kind).toBe('unknown');
  });
});

describe('deadlineBadge', () => {
  it('3일 이내 마감은 urgent', () => {
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 0 })).toBe('urgent');
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 3 })).toBe('urgent');
  });

  it('4-7일 마감은 soon', () => {
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 4 })).toBe('soon');
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 7 })).toBe('soon');
  });

  it('8일 이상은 normal (뱃지 없음)', () => {
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 8 })).toBe('normal');
    expect(deadlineBadge({ kind: 'parsed', daysRemaining: 30 })).toBe('normal');
  });

  it('expired/always/unknown은 같은 이름 그대로', () => {
    expect(deadlineBadge({ kind: 'expired', daysRemaining: -5 })).toBe('expired');
    expect(deadlineBadge({ kind: 'always' })).toBe('always');
    expect(deadlineBadge({ kind: 'unknown' })).toBe('unknown');
  });
});
