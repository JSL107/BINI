import {
  computeAttributes,
  extractEmploymentType,
  extractExperience,
  extractLocations,
  isRemoteJob,
  parseEmploymentTypeQuery,
  parseExperienceQuery,
  parseLocationQuery,
} from './job-attributes';

describe('extractExperience', () => {
  it('"신입" → newcomer', () => {
    expect(extractExperience(['신입'], '배경원화 디자이너')).toBe('newcomer');
  });
  it('"경력무관" → newcomer', () => {
    expect(extractExperience(['경력무관'], '캐릭터 원화')).toBe('newcomer');
  });
  it('"경력 1년" → junior', () => {
    expect(extractExperience(['경력 1년'], '원화 디자이너')).toBe('junior');
  });
  it('"경력 5년" → mid', () => {
    expect(extractExperience(['경력 5년'], '원화 디자이너')).toBe('mid');
  });
  it('"경력 7년" → senior', () => {
    expect(extractExperience(['경력 7년'], '원화 디자이너')).toBe('senior');
  });
  it('"시니어" → senior', () => {
    expect(extractExperience(['시니어'], '원화 디자이너')).toBe('senior');
  });
  it('"리드" → senior', () => {
    expect(extractExperience(['리드 아티스트'], '원화 디자이너')).toBe(
      'senior',
    );
  });
  it('senior 키워드가 우선 (jr+sr 동시 등장)', () => {
    expect(extractExperience(['주니어', '시니어'], '원화')).toBe('senior');
  });
  it('"경력자" → any', () => {
    expect(extractExperience(['경력자'], '원화 디자이너')).toBe('any');
  });
  it('아무 키워드도 없으면 null', () => {
    expect(extractExperience([], '원화 디자이너')).toBeNull();
    expect(extractExperience(['배경'], '몬스터 원화')).toBeNull();
  });
});

describe('extractEmploymentType', () => {
  it('"정규직" → fulltime', () => {
    expect(extractEmploymentType(['정규직'], '원화')).toBe('fulltime');
  });
  it('"계약직" → contract', () => {
    expect(extractEmploymentType(['계약직'], '원화')).toBe('contract');
  });
  it('"외주" → freelance', () => {
    expect(extractEmploymentType(['외주'], '원화')).toBe('freelance');
  });
  it('"인턴" → intern', () => {
    expect(extractEmploymentType(['인턴'], '원화')).toBe('intern');
  });
  it('"프리랜서" → freelance', () => {
    expect(extractEmploymentType([], '프리랜서 원화 디자이너')).toBe(
      'freelance',
    );
  });
  it('intern이 fulltime/contract보다 우선', () => {
    expect(extractEmploymentType(['정규직', '인턴'], '원화')).toBe('intern');
  });
  it('아무 키워드도 없으면 null', () => {
    expect(extractEmploymentType([], '원화 디자이너')).toBeNull();
  });
});

describe('extractLocations', () => {
  it('단일 시도', () => {
    expect(extractLocations(['서울'], '원화 디자이너')).toEqual(['서울']);
  });
  it('다중 시도 (KNOWN_LOCATIONS 순서)', () => {
    // KNOWN_LOCATIONS 순서: 서울, 경기, 인천, 부산, ...
    expect(extractLocations(['부산', '경기'], '서울 본사 원화')).toEqual([
      '서울',
      '경기',
      '부산',
    ]);
  });
  it('중복 등장은 한 번만', () => {
    expect(extractLocations(['서울', '서울 강남'], '서울 원화')).toEqual([
      '서울',
    ]);
  });
  it('알 수 없는 지역은 무시', () => {
    expect(extractLocations(['도쿄'], 'Tokyo 원화')).toEqual([]);
  });
  it('빈 입력은 빈 배열', () => {
    expect(extractLocations([], '')).toEqual([]);
  });
});

describe('isRemoteJob', () => {
  it('"재택" → true', () => {
    expect(isRemoteJob(['재택'], '원화')).toBe(true);
  });
  it('"원격" → true', () => {
    expect(isRemoteJob(['원격근무'], '원화')).toBe(true);
  });
  it('"remote" → true', () => {
    expect(isRemoteJob(['remote'], 'character artist')).toBe(true);
  });
  it('"Hybrid" → true', () => {
    expect(isRemoteJob(['Hybrid'], 'character artist')).toBe(true);
  });
  it('일반 잡은 false', () => {
    expect(isRemoteJob(['서울'], '원화 디자이너')).toBe(false);
  });
});

describe('computeAttributes', () => {
  it('4개 필드를 한 번에 산출', () => {
    const attrs = computeAttributes(['신입', '정규직', '서울', '재택'], '원화');
    expect(attrs).toEqual({
      experienceLevel: 'newcomer',
      employmentType: 'fulltime',
      locations: ['서울'],
      isRemote: true,
    });
  });
  it('아무것도 매칭 안 되면 null/null/[]/false', () => {
    expect(computeAttributes([], '원화 디자이너')).toEqual({
      experienceLevel: null,
      employmentType: null,
      locations: [],
      isRemote: false,
    });
  });
});

describe('parseExperienceQuery', () => {
  it('CSV → 알려진 값만', () => {
    expect(parseExperienceQuery('newcomer,senior,unknown')).toEqual([
      'newcomer',
      'senior',
    ]);
  });
  it('배열 입력 처리', () => {
    expect(parseExperienceQuery(['junior', 'mid'])).toEqual(['junior', 'mid']);
  });
  it('undefined/빈문자열 → []', () => {
    expect(parseExperienceQuery(undefined)).toEqual([]);
    expect(parseExperienceQuery('')).toEqual([]);
  });
});

describe('parseEmploymentTypeQuery', () => {
  it('알려진 값만 통과', () => {
    expect(parseEmploymentTypeQuery('fulltime,bogus,contract')).toEqual([
      'fulltime',
      'contract',
    ]);
  });
});

describe('parseLocationQuery', () => {
  it('알려진 시도만 통과', () => {
    expect(parseLocationQuery('서울,도쿄,경기')).toEqual(['서울', '경기']);
  });
  it('빈 토큰은 무시', () => {
    expect(parseLocationQuery('서울,,경기,')).toEqual(['서울', '경기']);
  });
});
