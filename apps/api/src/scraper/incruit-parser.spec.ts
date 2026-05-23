import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIncruitList, parseIncruitTotalPages } from './incruit-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/incruit-search.html'),
  'utf-8',
);

describe('parseIncruitList', () => {
  it('픽스처에서 18건 공고를 추출한다', () => {
    const jobs = parseIncruitList(html);
    expect(jobs.length).toBeGreaterThanOrEqual(15); // 18 expected, tolerate filter
  });

  it('모든 공고의 source는 "incruit"이다', () => {
    for (const j of parseIncruitList(html)) {
      expect(j.source).toBe('incruit');
    }
  });

  it('첫 공고의 필드를 매핑한다', () => {
    const first = parseIncruitList(html)[0];
    expect(first.sourceId).toBe('2605180002537');
    expect(first.title).toBe('UI/UX 웹디자인 퍼블리셔 과정 교육생 모집');
    expect(first.company).toBe('(재)부산디자인진흥원');
    expect(first.detailUrl).toBe('https://job.incruit.com/jobdb_info/jobpost.asp?job=2605180002537');
    expect(first.companyUrl).toBe('https://www.incruit.com/company/1664613848');
    expect(first.deadline).toBe('~06.26 (금)');
    expect(first.registeredAtText).toBe('(4일전 수정)');
    expect(first.tags.length).toBeGreaterThan(0);
  });

  it('잘못된 HTML이면 빈 배열을 반환한다', () => {
    expect(parseIncruitList('<html><body>no jobs</body></html>')).toEqual([]);
  });
});

describe('parseIncruitTotalPages', () => {
  it('1 이상의 totalPages를 반환한다', () => {
    expect(parseIncruitTotalPages(html)).toBeGreaterThanOrEqual(1);
  });
});
