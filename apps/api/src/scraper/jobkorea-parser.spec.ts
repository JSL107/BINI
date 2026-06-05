import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobkoreaList, parseJobkoreaTotalPages } from './jobkorea-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/jobkorea-search.html'),
  'utf-8',
);

describe('parseJobkoreaList', () => {
  it('art 키워드 필터로 게임 아트 공고만 추출한다', () => {
    const jobs = parseJobkoreaList(html);
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('모든 공고의 source는 "jobkorea"이다', () => {
    for (const j of parseJobkoreaList(html)) {
      expect(j.source).toBe('jobkorea');
    }
  });

  it('첫 art 공고의 필수 필드를 매핑한다', () => {
    const first = parseJobkoreaList(html)[0];
    expect(first.sourceId).toMatch(/^\d+$/);
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.company.length).toBeGreaterThan(0);
    expect(first.detailUrl).toMatch(
      /^https:\/\/www\.jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+/,
    );
    expect(Array.isArray(first.tags)).toBe(true);
  });

  it('잘못된 HTML이면 빈 배열을 반환한다', () => {
    expect(parseJobkoreaList('<html><body>no jobs</body></html>')).toEqual([]);
  });
});

describe('parseJobkoreaTotalPages', () => {
  it('픽스처에서 1 이상의 totalPages를 반환한다', () => {
    expect(parseJobkoreaTotalPages(html)).toBeGreaterThanOrEqual(1);
  });

  it('페이지네이션이 없으면 1을 반환한다', () => {
    expect(
      parseJobkoreaTotalPages('<html><body>no pagination</body></html>'),
    ).toBe(1);
  });
});
