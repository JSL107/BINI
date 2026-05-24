import { isGenericBracketTerm } from './job-images.service';

describe('isGenericBracketTerm', () => {
  it('빈/공백 입력은 generic으로 판정한다 (bracket fallback skip)', () => {
    expect(isGenericBracketTerm('')).toBe(true);
    expect(isGenericBracketTerm('   ')).toBe(true);
  });

  it('직군/기술 일반 단어는 generic이라 bracket fallback skip 대상', () => {
    expect(isGenericBracketTerm('3D 모델링')).toBe(true); // saramin 실측
    expect(isGenericBracketTerm('2D 디자이너')).toBe(true);
    expect(isGenericBracketTerm('캐릭터 원화')).toBe(true);
    expect(isGenericBracketTerm('배경 아티스트')).toBe(true);
    expect(isGenericBracketTerm('VFX')).toBe(true);
    expect(isGenericBracketTerm('UI')).toBe(true);
    expect(isGenericBracketTerm('모션 그래픽')).toBe(true);
  });

  // 실 production 경로: title-parser가 imageQuery를 항상 `${bracket} 게임` suffix와 함께
  // 만든다(`title-parser.ts:49`). 따라서 호출부에 도달하는 입력은 raw bracket이 아니라
  // 항상 `XXX 게임` 형식 — 그 경로를 spec이 우회하지 않도록 직접 검증.
  it('production 호출 경로(`<bracket> 게임` suffix)도 동일하게 분기한다', () => {
    expect(isGenericBracketTerm('3D 모델링 게임')).toBe(true); // saramin 실측 경로
    expect(isGenericBracketTerm('캐릭터 게임')).toBe(true);
    expect(isGenericBracketTerm('디자이너 게임')).toBe(true);
    // 게임명이 한 단어라도 들어가면 통과
    expect(isGenericBracketTerm('원신 게임')).toBe(false);
    expect(isGenericBracketTerm('OVERDARE 게임')).toBe(false);
    expect(isGenericBracketTerm('프로젝트 ES 게임')).toBe(false);
    expect(isGenericBracketTerm('나이트 크로우 게임')).toBe(false);
  });

  it('실제 게임명 또는 코드네임은 generic 아님 (bracket fallback 발화)', () => {
    expect(isGenericBracketTerm('원신')).toBe(false);
    expect(isGenericBracketTerm('OVERDARE')).toBe(false);
    expect(isGenericBracketTerm('나이트 크로우')).toBe(false);
    expect(isGenericBracketTerm('프로젝트 ES')).toBe(false);
    expect(isGenericBracketTerm('Project NL')).toBe(false);
    expect(isGenericBracketTerm('리니지')).toBe(false);
  });

  it('한 단어라도 비-generic이면 통과시킨다 (보수적 fallback)', () => {
    // "원신 캐릭터" — '원신'은 게임명, '캐릭터'는 generic
    // 전체로는 게임 관련 search가 의미 있으니 발화
    expect(isGenericBracketTerm('원신 캐릭터')).toBe(false);
  });

  it('대소문자/공백 정규화', () => {
    expect(isGenericBracketTerm('  3D   모델링  ')).toBe(true);
    expect(isGenericBracketTerm('3d')).toBe(true);
    expect(isGenericBracketTerm('Vfx')).toBe(true);
  });
});
