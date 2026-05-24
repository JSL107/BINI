import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCareerSitesMarkdown } from './companies-parser';
import { canonicalUrlKey, dedupeCareerSites } from './companies.service';

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

  it('extra-career-sites.md 보강 목록도 같은 파서로 파싱된다', () => {
    const extra = readFileSync(
      join(__dirname, 'extra-career-sites.md'),
      'utf-8',
    );
    const sites = parseCareerSitesMarkdown(extra);
    const companies = sites.filter((s) => s.category === 'company');
    expect(companies.length).toBeGreaterThanOrEqual(30);
    // 대표 회사 몇 개 샘플 검증
    expect(companies.some((s) => s.name.includes('엔픽셀'))).toBe(true);
    expect(companies.some((s) => s.name.includes('라이온하트'))).toBe(true);
    expect(companies.some((s) => s.name.includes('스튜디오비사이드'))).toBe(true);
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

describe('canonicalUrlKey', () => {
  it('http/https, 대소문자, 끝 슬래시, www 차이를 흡수한다', () => {
    expect(canonicalUrlKey('https://www.example.com/careers/')).toBe(
      canonicalUrlKey('http://example.com/careers'),
    );
    expect(canonicalUrlKey('https://EXAMPLE.com/Path')).toBe('example.com/Path');
  });

  it('query/hash는 무시한다', () => {
    expect(canonicalUrlKey('https://a.com/x?q=1#frag')).toBe(
      canonicalUrlKey('https://a.com/x'),
    );
  });

  it('빈 path는 / 로 정규화', () => {
    expect(canonicalUrlKey('https://a.com')).toBe('a.com/');
  });

  it('URL 파싱 실패 시 trim+lowercase fallback', () => {
    expect(canonicalUrlKey('  NOT-A-URL ')).toBe('not-a-url');
  });
});

describe('dedupeCareerSites', () => {
  it('primary가 같은 URL을 가지면 extra는 무시된다', () => {
    const primary = [
      { name: '넥슨', url: 'https://career.nexon.com/', category: 'company' as const },
    ];
    const extra = [
      { name: 'NEXON Careers', url: 'http://www.career.nexon.com', category: 'company' as const },
    ];
    const merged = dedupeCareerSites(primary, extra);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('넥슨');
  });

  it('서로 다른 URL은 모두 유지', () => {
    const merged = dedupeCareerSites(
      [{ name: 'A', url: 'https://a.com/', category: 'company' }],
      [{ name: 'B', url: 'https://b.com/', category: 'company' }],
    );
    expect(merged).toHaveLength(2);
  });

  it('extra 내부 중복도 제거', () => {
    const merged = dedupeCareerSites(
      [],
      [
        { name: 'X1', url: 'https://x.com/recruit', category: 'company' },
        { name: 'X2', url: 'https://x.com/recruit/', category: 'company' },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('X1');
  });
});
