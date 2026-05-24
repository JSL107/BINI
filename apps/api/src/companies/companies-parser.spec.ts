import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCareerSitesMarkdown } from './companies-parser';

const markdown = readFileSync(
  join(__dirname, '../../test/fixtures/korea-game-career-sites.md'),
  'utf-8',
);

describe('parseCareerSitesMarkdown', () => {
  it('회사 채용 페이지 30건 이상을 추출한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    const companies = sites.filter((s) => s.category === 'company');
    expect(companies.length).toBeGreaterThanOrEqual(30);
  });

  it('관련 채용 사이트 6건 정도를 추출한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    const boards = sites.filter((s) => s.category === 'jobBoard');
    expect(boards.length).toBeGreaterThanOrEqual(5);
  });

  it('기업 정보 사이트 2건을 추출한다 (크레딧잡 제외 후)', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    const info = sites.filter((s) => s.category === 'companyInfo');
    expect(info.length).toBeGreaterThanOrEqual(2);
  });

  it('첫 회사는 게임빌-컴투스이며 url이 http로 시작한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    const first = sites.find((s) => s.category === 'company');
    expect(first?.name).toContain('게임빌');
    expect(first?.url).toMatch(/^https?:\/\//);
  });

  it('잡코리아 같은 jobBoard 항목을 인식한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    expect(sites.some((s) => s.category === 'jobBoard' && /잡코리아/.test(s.name))).toBe(true);
  });

  it('빈 마크다운은 빈 배열 반환', () => {
    expect(parseCareerSitesMarkdown('')).toEqual([]);
  });

  it('이름에서 "(보 지급)" / "(보너스 지급)" 같은 광고성 꼬리표를 제거한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    const wanted = sites.find((s) => /원티드/.test(s.name));
    expect(wanted).toBeDefined();
    expect(wanted!.name).not.toMatch(/지급|보너스/);
  });

  it('프로그래머스(career.programmers) 채용은 서비스 종료로 결과에서 제외한다', () => {
    const sites = parseCareerSitesMarkdown(markdown);
    expect(sites.some((s) => /프로그래머스/.test(s.name))).toBe(false);
    expect(sites.some((s) => /programmers\.co\.kr/i.test(s.url))).toBe(false);
  });

  it('크레딧잡은 결과에서 제외한다 (이름/URL 양쪽 모두 차단)', () => {
    const synthetic = `
## 자체 채용 사이트 링크
* [크레딧잡](https://kreditjob.com/)
* [정상회사](https://example.com/careers)

> ### 기업 정보 관련 사이트
>* [Kreditjob](https://kreditjob.com/info)
>* [정상정보](https://info.example.com)
`;
    const sites = parseCareerSitesMarkdown(synthetic);
    expect(sites.some((s) => /크레딧잡|kreditjob/i.test(s.name))).toBe(false);
    expect(sites.some((s) => /kreditjob/i.test(s.url))).toBe(false);
    // 정상 사이트는 그대로 유지
    expect(sites.some((s) => /정상회사/.test(s.name))).toBe(true);
    expect(sites.some((s) => /정상정보/.test(s.name))).toBe(true);
  });
});
