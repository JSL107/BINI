import { parseTitle, extractFirstBracket } from './title-parser';

describe('parseTitle', () => {
  it('대괄호가 게임명이면 game 타입으로 분류한다', () => {
    expect(parseTitle('[p.일렌시아] 배경 도트 디자이너', '게임듀오')).toEqual({
      gameTitle: 'p.일렌시아',
      imageQuery: 'p.일렌시아 게임',
      imageQueryType: 'game',
    });
  });

  it('영문/숫자 혼합 게임명도 game 타입으로 분류한다', () => {
    expect(
      parseTitle('[던파모바일2D] 2D 도트 아바타 디자이너', '네오플'),
    ).toEqual({
      gameTitle: '던파모바일2D',
      imageQuery: '던파모바일2D 게임',
      imageQueryType: 'game',
    });
  });

  it("'신규 프로젝트' 같은 일반어는 company 타입으로 대체한다", () => {
    expect(
      parseTitle('[신규 프로젝트] 캐릭터/배경 원화가', '슈퍼플럭스'),
    ).toEqual({
      gameTitle: null,
      imageQuery: '슈퍼플럭스',
      imageQueryType: 'company',
    });
  });

  it('이중 대괄호의 첫 항목이 조직명이면 company 타입으로 대체한다', () => {
    expect(
      parseTitle('[프론티어 스튜디오][MMORPG] 캐릭터 원화가', '매드엔진'),
    ).toEqual({
      gameTitle: null,
      imageQuery: '매드엔진',
      imageQueryType: 'company',
    });
  });

  it('장르 키워드는 company 타입으로 대체한다', () => {
    expect(parseTitle('[MMORPG] 원화가 모집', '어떤회사')).toEqual({
      gameTitle: null,
      imageQuery: '어떤회사',
      imageQueryType: 'company',
    });
  });

  it('지역/고용형태 태그는 company 타입으로 대체한다', () => {
    expect(parseTitle('[부산/인턴] 2026년 채용', '트리노드')).toEqual({
      gameTitle: null,
      imageQuery: '트리노드',
      imageQueryType: 'company',
    });
  });

  it('대괄호가 없으면 company 타입으로 대체한다', () => {
    expect(
      parseTitle('(프리랜서·외주 포함) 캐릭터 원화 디자이너', '퍼니팩'),
    ).toEqual({
      gameTitle: null,
      imageQuery: '퍼니팩',
      imageQueryType: 'company',
    });
  });

  it('게임명에 장르 코드가 substring으로 들어있어도 game으로 분류한다', () => {
    // 'Chaos'는 'aos'를 substring으로 포함하지만 실제 게임 제목이다
    expect(parseTitle('[Chaos] 원화가 모집', '회사')).toEqual({
      gameTitle: 'Chaos',
      imageQuery: 'Chaos 게임',
      imageQueryType: 'game',
    });
  });

  it("게임명이 'soft'로 끝나도 game으로 분류한다", () => {
    expect(parseTitle('[Herosoft] 배경 원화', '회사')).toEqual({
      gameTitle: 'Herosoft',
      imageQuery: 'Herosoft 게임',
      imageQueryType: 'game',
    });
  });

  it('회사명 대체 시 앞뒤 공백을 제거한다', () => {
    expect(parseTitle('[신규 프로젝트] 원화', '  넥슨  ')).toEqual({
      gameTitle: null,
      imageQuery: '넥슨',
      imageQueryType: 'company',
    });
  });
});

describe('extractFirstBracket', () => {
  it('앞 공백을 무시하고 첫 대괄호를 추출한다', () => {
    expect(extractFirstBracket('  [게임명] 디자이너')).toBe('게임명');
  });

  it('이중 대괄호에서 첫 번째만 추출한다', () => {
    expect(extractFirstBracket('[디아블로][MMORPG] 원화')).toBe('디아블로');
  });

  it('빈 대괄호는 빈 문자열을 반환한다', () => {
    expect(extractFirstBracket('[] 원화가')).toBe('');
  });

  it('대괄호가 없으면 null을 반환한다', () => {
    expect(extractFirstBracket('대괄호 없는 제목')).toBeNull();
  });
});
