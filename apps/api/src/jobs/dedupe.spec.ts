import {
  dedupeJobs,
  groupRawJobs,
  makeNormalizedKey,
  normalizeForDedup,
} from './dedupe';
import type { RawJob } from '../scraper/raw-job';

function mkJob(
  over: Partial<RawJob> & { source: RawJob['source']; sourceId: string },
): RawJob {
  return {
    company: over.company ?? '게임듀오',
    companyUrl: '',
    title: over.title ?? '[p.일렌시아] 배경 도트 디자이너',
    detailUrl: '',
    deadline: '상시',
    registeredAtText: '',
    tags: [],
    ...over,
  };
}

describe('normalizeForDedup', () => {
  it('공백/대괄호/소괄호/기호를 제거하고 lowercase한다', () => {
    expect(normalizeForDedup('[A]  Test (junior) - Designer')).toBe(
      'atestjuniordesigner',
    );
  });
  it('이미 정규화된 입력은 그대로 lowercase만', () => {
    expect(normalizeForDedup('abc')).toBe('abc');
  });
  it('빈 문자열은 빈 문자열', () => {
    expect(normalizeForDedup('')).toBe('');
  });
});

describe('dedupeJobs', () => {
  it('회사명+제목이 동일한 두 소스 공고를 하나로 합친다', () => {
    const jobs: RawJob[] = [
      mkJob({ source: 'gamejob', sourceId: '1', detailUrl: 'https://gj/1' }),
      mkJob({ source: 'wanted', sourceId: '99', detailUrl: 'https://wt/99' }),
    ];
    const result = dedupeJobs(jobs);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('gamejob');
    expect(result[0].sourceId).toBe('1');
    expect(result[0].alternateSources).toEqual([
      { source: 'wanted', detailUrl: 'https://wt/99' },
    ]);
  });

  it('정규화 대상(공백/대괄호) 차이는 같은 공고로 본다', () => {
    const jobs: RawJob[] = [
      mkJob({
        source: 'gamejob',
        sourceId: '1',
        title: '[p.일렌시아] 배경 도트 디자이너',
      }),
      mkJob({
        source: 'wanted',
        sourceId: '2',
        title: 'p.일렌시아 배경 도트 디자이너',
      }),
    ];
    expect(dedupeJobs(jobs)).toHaveLength(1);
  });

  it('회사가 다르면 다른 공고로 본다', () => {
    const jobs: RawJob[] = [
      mkJob({ source: 'gamejob', sourceId: '1', company: 'A' }),
      mkJob({ source: 'wanted', sourceId: '2', company: 'B' }),
    ];
    expect(dedupeJobs(jobs)).toHaveLength(2);
  });

  it('빈 배열은 빈 배열', () => {
    expect(dedupeJobs([])).toEqual([]);
  });

  it('첫 등장 소스를 primary로 두고 나머지는 alternateSources 순서 보존', () => {
    const jobs: RawJob[] = [
      mkJob({ source: 'wanted', sourceId: '99', detailUrl: 'https://wt/99' }),
      mkJob({ source: 'gamejob', sourceId: '1', detailUrl: 'https://gj/1' }),
    ];
    const result = dedupeJobs(jobs);
    expect(result[0].source).toBe('wanted');
    expect(result[0].alternateSources).toEqual([
      { source: 'gamejob', detailUrl: 'https://gj/1' },
    ]);
  });

  it('DedupedJob에 normalizedKey가 채워진다', () => {
    const result = dedupeJobs([
      mkJob({
        source: 'gamejob',
        sourceId: '1',
        company: 'A',
        title: 'Test Title',
      }),
    ]);
    expect(result[0].normalizedKey).toBe(makeNormalizedKey('A', 'Test Title'));
  });
});

describe('makeNormalizedKey', () => {
  it('정규화된 company와 title을 공백 한 칸으로 합친다', () => {
    expect(makeNormalizedKey('  [회사]  ', 'Designer  (Junior)')).toBe(
      '회사 designerjunior',
    );
  });
  it('동일 의미의 입력은 같은 키를 만든다', () => {
    expect(makeNormalizedKey('A', '[T] X')).toBe(makeNormalizedKey('a', 'tx'));
  });
});

describe('groupRawJobs', () => {
  function mkRaw(
    over: Partial<RawJob> & { source: RawJob['source']; sourceId: string },
  ): RawJob {
    return {
      company: over.company ?? '게임듀오',
      companyUrl: '',
      title: over.title ?? '[p.일렌시아] 배경 도트 디자이너',
      detailUrl: '',
      deadline: '상시',
      registeredAtText: '',
      tags: [],
      ...over,
    };
  }

  it('정규화 키 동일한 잡들을 한 그룹으로 묶고 입력 순서 보존', () => {
    const a = mkRaw({ source: 'gamejob', sourceId: '1' });
    const b = mkRaw({ source: 'wanted', sourceId: '2' });
    const groups = groupRawJobs([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary).toBe(a);
    expect(groups[0].members).toEqual([a, b]);
    expect(groups[0].normalizedKey).toBe(makeNormalizedKey(a.company, a.title));
  });
});
