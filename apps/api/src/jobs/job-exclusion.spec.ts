import { classifyExclusion, countExclusions } from './job-exclusion';

describe('classifyExclusion', () => {
  it.each([
    ['[SBS아카데미게임학원] 평일 게임원화 강사 모집', '교육·강사'],
    [
      '[전국/온라인]아트트리아카데미 웹툰/일러스트/게임원화 강사 모집',
      '교육·강사',
    ],
    [
      '한화에어로스페이스 참여기업 전액국비지원 AI실무인재 양성과정 교육생 모집',
      '교육·강사',
    ],
    ['[청월당(로켓AI)] 웹툰 작가 채용', '웹툰·출판'],
    [
      '[컴투스] [일본 IP 프로젝트] 카툰 렌더링&그래픽스 프로그래머 (3년 이상)',
      '비아트 직군',
    ],
    ['[신규 프로젝트] 시나리오 / 캐릭터 설정 기획 모집', '비아트 직군'],
    ['[부산] 게임 마케팅/사업PM/글로벌GM(외국어가능)', '비아트 직군'],
    [
      '[NC][단기계약직] [Blade&Soul] 게임 내 아이템, 아이콘 디자이너 모집',
      '아트 밖 디자인',
    ],
    [
      '[비케이브] ACC디자인팀 가방·액세서리 디자이너 경력채용',
      '아트 밖 디자인',
    ],
  ])('%s → %s 로 제외한다', (title, rule) => {
    expect(classifyExclusion(title)).toBe(rule);
  });

  it.each([
    '[더핑크퐁컴퍼니] 2D 캐릭터 원화가 (문샤크) (6개월 계약직)',
    '[위메이드커넥트] 배경 원화 담당자 모집',
    '[넥슨코리아] 빈딕투스 디파잉 페이트 배경 컨셉 아티스트 (아르바이트)',
    '[크리티카] 3D 캐릭터 모델러 모집',
    '[제우스] 애니메이터',
    '[ 유명 대기업 계열 게임사 ] 아트디렉터(리드급)',
    '[KANA] [아트] 아트 PM',
    '[엘소드] 게임 개발 전 분야 수시 모집',
  ])('%s 는 제외하지 않는다', (title) => {
    expect(classifyExclusion(title)).toBeNull();
  });

  it('제목이 비어도 터지지 않는다', () => {
    expect(classifyExclusion('')).toBeNull();
  });
});

describe('countExclusions', () => {
  it('규칙군별로 센다', () => {
    const counts = countExclusions([
      '[SBS아카데미게임학원] 평일 게임원화 강사 모집',
      '[전국/온라인]아트트리아카데미 웹툰/일러스트/게임원화 강사 모집',
      '[청월당(로켓AI)] 웹툰 작가 채용',
      '[위메이드커넥트] 배경 원화 담당자 모집',
    ]);
    expect(counts['교육·강사']).toBe(2);
    expect(counts['웹툰·출판']).toBe(1);
    expect(counts['비아트 직군']).toBe(0);
    expect(counts['아트 밖 디자인']).toBe(0);
  });
});
