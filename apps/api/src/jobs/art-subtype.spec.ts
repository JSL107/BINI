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
      extractArtSubtypes('[신규 프로젝트] 캐릭터 / 배경 아티스트 모집', 원화),
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

  describe('원화를 겸하는 다른 아트 직군 제목은 하위 구분을 붙이지 않는다', () => {
    it('3D 배경 모델러는 붙이지 않는다', () => {
      expect(extractArtSubtypes('[Project ES] 3D 배경 모델러', 원화)).toEqual(
        [],
      );
    });

    it('3D 배경 레벨러는 붙이지 않는다', () => {
      expect(extractArtSubtypes('[Project ES] 3D 배경 레벨러', 원화)).toEqual(
        [],
      );
    });

    it('3D 캐릭터 제작 아티스트는 붙이지 않는다', () => {
      expect(
        extractArtSubtypes(
          '[NC자회사][빅파이어게임즈][단기계약직] 3D 캐릭터 제작 아티스트 모집',
          원화,
        ),
      ).toEqual([]);
    });

    it('3D 캐릭터 어셋 제작 아티스트는 붙이지 않는다', () => {
      expect(
        extractArtSubtypes(
          '[NC][단기계약직][AION2] 3D 캐릭터 어셋 제작 아티스트 모집',
          원화,
        ),
      ).toEqual([]);
    });

    it('3D 캐릭터/배경/애니메이터/이펙터를 함께 찾는 제목은 붙이지 않는다', () => {
      expect(
        extractArtSubtypes(
          '[프리랜서] 유니티 3D 캐릭터 / 배경 / 애니메이터 / 이펙터 디자이너 모집',
          원화,
        ),
      ).toEqual([]);
    });
  });

  describe('제목에 원화·일러스트가 명시되면 다른 직군 단서가 있어도 그대로 붙인다', () => {
    it('캐릭터원화가는 3D 등 단서가 없어도 그대로 캐릭터를 붙인다', () => {
      expect(
        extractArtSubtypes('[브라운더스트2] 캐릭터원화가 모집', 원화),
      ).toEqual(['캐릭터']);
    });

    it('배경 원화가는 배경·컨셉을 붙인다', () => {
      expect(
        extractArtSubtypes('[시프트업] 승리의 여신 니케 / 배경 원화가', 원화),
      ).toEqual(['배경·컨셉']);
    });

    it('배경원화(컨셉)처럼 원화가 붙어 있으면 배경·컨셉을 붙인다', () => {
      expect(
        extractArtSubtypes('[LOST ARK] 배경원화(컨셉) 담당', 원화),
      ).toEqual(['배경·컨셉']);
    });

    it('2D는 다른 직군 단서가 아니므로 원화 제목 그대로 캐릭터를 붙인다', () => {
      expect(
        extractArtSubtypes('[더핑크퐁컴퍼니] 2D 캐릭터 원화가 (문샤크)', 원화),
      ).toEqual(['캐릭터']);
    });
  });

  it('원화·다른 직군 단서 둘 다 없는 제목은 기존 규칙대로 배경·컨셉을 붙인다', () => {
    expect(
      extractArtSubtypes('[NC][AION2] 배경 식생 아티스트 모집', [
        '원화',
        '모델링',
      ]),
    ).toEqual(['배경·컨셉']);
  });
});
