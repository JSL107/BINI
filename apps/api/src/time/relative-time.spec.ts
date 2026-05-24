import { parseRelativeTime } from './relative-time';

describe('parseRelativeTime', () => {
  const now = new Date('2026-05-22T12:00:00Z');

  it("'4시간 전 등록'을 4시간 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('4시간 전 등록', now).toISOString())
      .toBe('2026-05-22T08:00:00.000Z');
  });

  it("'30분 전 등록'을 30분 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('30분 전 등록', now).toISOString())
      .toBe('2026-05-22T11:30:00.000Z');
  });

  it("'2일 전 등록'을 2일 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('2일 전 등록', now).toISOString())
      .toBe('2026-05-20T12:00:00.000Z');
  });

  it("'1주 전 등록'을 7일 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('1주 전 등록', now).toISOString())
      .toBe('2026-05-15T12:00:00.000Z');
  });

  it("'3개월 전 등록'을 90일 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('3개월 전 등록', now).toISOString())
      .toBe('2026-02-21T12:00:00.000Z');
  });

  it("'1년 전 등록'을 365일 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('1년 전 등록', now).toISOString())
      .toBe('2025-05-22T12:00:00.000Z');
  });

  it("'방금 전'은 now를 반환한다", () => {
    expect(parseRelativeTime('방금 전 등록', now).toISOString())
      .toBe('2026-05-22T12:00:00.000Z');
  });

  it('해석할 수 없는 문자열은 epoch(정렬상 맨 뒤)를 반환한다', () => {
    expect(parseRelativeTime('알 수 없음', now).toISOString())
      .toBe('1970-01-01T00:00:00.000Z');
  });
});
