import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseWantedList,
  parseWantedTotalPages,
  ART_KEYWORD_REGEX,
} from './wanted-parser';

const json = readFileSync(
  join(__dirname, '../../test/fixtures/wanted-list.json'),
  'utf-8',
);

describe('parseWantedList', () => {
  it('art 키워드 필터로 게임 아트 공고만 추출한다 (픽스처에서 1건)', () => {
    const jobs = parseWantedList(json);
    expect(jobs).toHaveLength(1);
  });

  it('모든 공고의 source는 "wanted"이다', () => {
    for (const j of parseWantedList(json)) {
      expect(j.source).toBe('wanted');
    }
  });

  it('첫 art 공고의 필드를 정확히 매핑한다', () => {
    const first = parseWantedList(json)[0];
    expect(first.sourceId).toBe('363680');
    expect(first.title).toBe('2D 모션그래픽 디자이너');
    expect(first.company).toBe('하이퍼앰코리아');
    expect(first.detailUrl).toBe('https://www.wanted.co.kr/wd/363680');
    expect(first.companyUrl).toBe('https://www.wanted.co.kr/company/20466');
    expect(first.deadline).toBe('2026-08-22');
    expect(first.registeredAtText).toBe('');
    expect(first.tags).toEqual(['서울']);
  });

  it('잘못된 JSON이면 빈 배열을 반환한다', () => {
    expect(parseWantedList('not json')).toEqual([]);
  });

  it('data 배열이 없으면 빈 배열을 반환한다', () => {
    expect(parseWantedList('{}')).toEqual([]);
  });
});

describe('parseWantedTotalPages', () => {
  it('links.next가 null이면 1', () => {
    // 픽스처는 39건이라 next가 null일 것
    expect(parseWantedTotalPages(json)).toBe(1);
  });

  it('next 링크가 있으면 최소 2', () => {
    const fake = JSON.stringify({
      data: [],
      links: { next: '/api/v4/jobs?offset=40' },
    });
    expect(parseWantedTotalPages(fake)).toBeGreaterThanOrEqual(2);
  });

  it('잘못된 입력은 1', () => {
    expect(parseWantedTotalPages('not json')).toBe(1);
  });
});

describe('ART_KEYWORD_REGEX', () => {
  it('게임 아트 키워드를 매칭한다', () => {
    expect(ART_KEYWORD_REGEX.test('원화가')).toBe(true);
    expect(ART_KEYWORD_REGEX.test('캐릭터 일러스트')).toBe(true);
    expect(ART_KEYWORD_REGEX.test('Concept Art Lead')).toBe(true);
  });
  it('관련 없는 직군은 매칭하지 않는다', () => {
    expect(ART_KEYWORD_REGEX.test('HR 매니저')).toBe(false);
    expect(ART_KEYWORD_REGEX.test('Frontend Engineer')).toBe(false);
  });
});
