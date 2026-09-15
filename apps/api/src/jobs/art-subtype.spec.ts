import { extractArtSubtypes } from './art-subtype';

const 원화 = ['원화'];

describe('extractArtSubtypes', () => {
  it('캐릭터 원화를 잡는다', () => {
    expect(
      extractArtSubtypes('[더핑크퐁컴퍼니] 2D 캐릭터 원화가 (문샤크)', 원화),
    ).toEqual(['캐릭터']);
  });

  it('배경·컨셉 원화를 잡는다', () => {
    expect(
      extractArtSubtypes('[위메이드커넥트] 배경 원화 담당자 모집', 원화),
    ).toEqual(['배경·컨셉']);
  });

  it('영문 표기여도 캐릭터 신호가 있으면 컨셉만으로 배경을 붙이지 않는다', () => {
    expect(
      extractArtSubtypes('[Loonshot Games] Sr. Character Concept Artist', 원화),
    ).toEqual(['캐릭터']);
  });

  it('캐릭터 컨셉아티스트는 배경을 붙이지 않는다', () => {
    expect(
      extractArtSubtypes(
        '[NOUGH Studio] P의 거짓 차기작 캐릭터 컨셉아티스트',
        원화,
      ),
    ).toEqual(['캐릭터']);
  });

  it('캐릭터 컨셉 아티스트도 배경을 붙이지 않는다', () => {
    expect(
      extractArtSubtypes('[NC][계약직][AION2] 캐릭터 컨셉 아티스트 모집', 원화),
    ).toEqual(['캐릭터']);
  });

  it('캐릭터 컨셉 모집도 배경을 붙이지 않는다', () => {
    expect(
      extractArtSubtypes(
        '[NC][단기계약직][Project JSY] AAA콘솔 액션RPG 프로젝트 캐릭터 컨셉 모집',
        원화,
      ),
    ).toEqual(['캐릭터']);
  });

  it('캐릭터 신호가 없는 바른 컨셉 아티스트는 배경·컨셉을 붙인다', () => {
    expect(extractArtSubtypes('[신규 PC/콘솔] 컨셉 아티스트', 원화)).toEqual([
      '배경·컨셉',
    ]);
  });

  it('배경이 명시되면 캐릭터와 함께 있어도 배경·컨셉을 붙인다', () => {
    expect(
      extractArtSubtypes(
        '[프리랜서] 유니티 3D 캐릭터 / 배경 / 애니메이터 / 이펙터 디자이너 모집',
        원화,
      ),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('둘 다 있으면 둘 다 붙인다', () => {
    expect(
      extractArtSubtypes('[신규 프로젝트] 캐릭터/배경 원화가', 원화),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('단서가 없으면 빈 배열이다', () => {
    expect(
      extractArtSubtypes('[신입/경력] 게임 아트 원화가 모집', 원화),
    ).toEqual([]);
  });

  it('원화 직군이 아니면 캐릭터가 있어도 붙이지 않는다', () => {
    expect(
      extractArtSubtypes('[크리티카] 3D 캐릭터 모델러 모집', ['모델링']),
    ).toEqual([]);
    expect(
      extractArtSubtypes('[KANA] 3D 캐릭터 애니메이터', ['애니메이션']),
    ).toEqual([]);
  });

  it('원화를 겸하는 공고에는 붙인다', () => {
    expect(
      extractArtSubtypes('[신규 프로젝트] 캐릭터/배경 원화가', [
        '게임개발(모바일)',
        '인터페이스 디자인',
        '원화',
        '이펙트·FX',
      ]),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('직군이 비어 있으면 붙이지 않는다', () => {
    expect(extractArtSubtypes('캐릭터 원화가 모집', [])).toEqual([]);
  });
});
