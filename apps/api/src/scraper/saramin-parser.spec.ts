import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSaraminList, parseSaraminTotalPages } from './saramin-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/saramin-search.html'),
  'utf-8',
);

describe('parseSaraminList', () => {
  it('픽스처에서 art whitelist 적용 후 21건 공고를 추출한다', () => {
    // 56ceee4 fix(saramin): whitelist art-related titles only — art 키워드 미포함
    // 잡들이 컷되면서 26 → 21로 줄었다. 그 커밋에서 spec 갱신이 누락돼 있던 것.
    const jobs = parseSaraminList(html);
    expect(jobs.length).toBe(21);
  });

  it('모든 공고의 source는 "saramin"이다', () => {
    for (const j of parseSaraminList(html)) {
      expect(j.source).toBe('saramin');
    }
  });

  it('첫 공고의 필드를 매핑한다', () => {
    const first = parseSaraminList(html)[0];
    expect(first.sourceId).toBe('53625619');
    expect(first.title).toBe('[신입/경력] 게임 아트 원화가 모집');
    expect(first.company).toBe('주식회사퍼피띵게임즈');
    expect(first.detailUrl).toContain('https://www.saramin.co.kr/zf_user/jobs/relay/view');
    expect(first.detailUrl).toContain('rec_idx=53625619');
    expect(first.companyUrl).toContain('https://www.saramin.co.kr/zf_user/company-info/view');
    expect(first.deadline).toBe('~ 06/13(토)');
    expect(first.registeredAtText).toBe('등록일 26/04/14');
    // 태그는 지역/경력/학력/형태 + 카테고리 일부
    expect(first.tags.length).toBeGreaterThan(0);
  });

  it('잘못된 HTML이면 빈 배열을 반환한다', () => {
    expect(parseSaraminList('<html><body>no jobs</body></html>')).toEqual([]);
  });
});

describe('parseSaraminTotalPages', () => {
  it('단일 페이지 결과면 1을 반환한다', () => {
    expect(parseSaraminTotalPages(html)).toBe(1);
  });
});
