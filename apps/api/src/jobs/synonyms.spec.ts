import { expandSearchTerms } from './synonyms';

describe('expandSearchTerms', () => {
  it('빈 문자열은 빈 배열', () => {
    expect(expandSearchTerms('')).toEqual([]);
    expect(expandSearchTerms('   ')).toEqual([]);
  });

  it('단일 토큰이 그룹에 있으면 그룹 합집합 반환', () => {
    const r = expandSearchTerms('원화');
    expect(r).toEqual(expect.arrayContaining(['원화', '일러스트', '컨셉아트']));
    // 자기 자신은 항상 포함
    expect(r).toContain('원화');
  });

  it('영문 동의어도 같은 그룹으로 확장', () => {
    const r = expandSearchTerms('animator');
    expect(r).toEqual(
      expect.arrayContaining(['animator', 'animation', '애니메이터']),
    );
  });

  it('대소문자/공백 무관', () => {
    const upper = expandSearchTerms('UI');
    expect(upper).toEqual(expect.arrayContaining(['ui', '유아이']));
    const padded = expandSearchTerms('  원화  ');
    expect(padded.length).toBeGreaterThan(1);
  });

  it('알려지지 않은 단일 토큰은 자기 자신만', () => {
    expect(expandSearchTerms('넥슨')).toEqual(['넥슨']);
  });

  it('공백 포함 다중 토큰은 확장하지 않음 (false-positive 회피)', () => {
    expect(expandSearchTerms('원화 신입')).toEqual(['원화 신입']);
  });

  it('확장 결과에 중복 없음', () => {
    const r = expandSearchTerms('일러스트');
    const set = new Set(r);
    expect(r.length).toBe(set.size);
  });
});
