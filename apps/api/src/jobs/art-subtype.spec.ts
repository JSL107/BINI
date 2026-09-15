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

  it('영문 표기도 잡는다', () => {
    expect(
      extractArtSubtypes('[Loonshot Games] Sr. Character Concept Artist', 원화),
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
