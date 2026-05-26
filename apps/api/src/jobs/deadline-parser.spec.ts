import { parseDeadlineToDate } from './deadline-parser';

// Date 생성이 시스템 TZ에 따라 흔들리지 않도록 KST 고정. (web/lib/deadline.spec.ts와 같음)
process.env.TZ = 'Asia/Seoul';

const NOW = new Date('2026-05-24T12:00:00+09:00');

describe('parseDeadlineToDate', () => {
  it('빈/공백/null/undefined는 null', () => {
    expect(parseDeadlineToDate('', NOW)).toBeNull();
    expect(parseDeadlineToDate('   ', NOW)).toBeNull();
    expect(parseDeadlineToDate(null, NOW)).toBeNull();
    expect(parseDeadlineToDate(undefined, NOW)).toBeNull();
  });

  it('상시/수시/채용시는 null (무한 마감)', () => {
    expect(parseDeadlineToDate('상시', NOW)).toBeNull();
    expect(parseDeadlineToDate('수시', NOW)).toBeNull();
    expect(parseDeadlineToDate('채용시', NOW)).toBeNull();
    expect(parseDeadlineToDate('채용 시', NOW)).toBeNull();
    expect(parseDeadlineToDate('상시 채용', NOW)).toBeNull();
  });

  it('YYYY-MM-DD 미래 마감을 Date로 반환', () => {
    const d = parseDeadlineToDate('2026-06-01', NOW);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5); // 6월
    expect(d!.getDate()).toBe(1);
  });

  it('YYYY-MM-DD 과거 마감도 Date로 반환(의미 보존)', () => {
    const d = parseDeadlineToDate('2026-05-01', NOW);
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(4); // 5월
    expect(d!.getDate()).toBe(1);
  });

  it('YYYY.MM.DD / YYYY/MM/DD 구분자 변형도 인식', () => {
    expect(parseDeadlineToDate('2026.06.01', NOW)).not.toBeNull();
    expect(parseDeadlineToDate('2026/06/01', NOW)).not.toBeNull();
  });

  it('MM/DD 미래 마감 (같은 해 추정)', () => {
    const d = parseDeadlineToDate('06/01(월)', NOW);
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(1);
  });

  it('MM/DD 30일 이내 과거는 Date 반환 (직전에 마감된 잡 표시)', () => {
    const d = parseDeadlineToDate('05/10(일)', NOW); // 14일 전
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(10);
  });

  it('MM/DD 30일 이상 과거는 null (작년 잘못 살아남기 회피)', () => {
    const d = parseDeadlineToDate('01/10(토)', NOW);
    expect(d).toBeNull();
  });

  it('한글 표기 "5월 30일"', () => {
    const d = parseDeadlineToDate('5월 30일까지', NOW);
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(30);
  });

  it('범위 밖 날짜는 null', () => {
    expect(parseDeadlineToDate('13/45', NOW)).toBeNull();
    expect(parseDeadlineToDate('99/99', NOW)).toBeNull();
    expect(parseDeadlineToDate('2026-13-01', NOW)).toBeNull();
    expect(parseDeadlineToDate('2026-02-30', NOW)).toBeNull(); // JS 자동 정규화 차단
  });

  it('완전히 모르는 텍스트는 null', () => {
    expect(parseDeadlineToDate('내일까지', NOW)).toBeNull();
    expect(parseDeadlineToDate('이번주', NOW)).toBeNull();
  });
});
