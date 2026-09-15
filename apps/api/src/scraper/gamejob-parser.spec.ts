import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobList, parseTotalPages } from './gamejob-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-wonhwa-list.html'),
  'utf-8',
);

describe('parseJobList', () => {
  it('픽스처에서 40개 공고를 추출한다', () => {
    expect(parseJobList(html).length).toBe(40);
  });

  it('첫 공고의 필드를 정확히 파싱한다', () => {
    const first = parseJobList(html)[0];
    expect(first.source).toBe('gamejob');
    expect(first.sourceId).toBe('280518');
    expect(first.company).toBe('㈜원더소프트');
    expect(first.title).toBe(
      '[경북글로벌게임센터] 원더킹, 세피루스 2D 원화및 도트 구인',
    );
    expect(first.detailUrl).toContain('/Recruit/GI_Read/View?GI_No=280518');
    expect(first.companyUrl).toContain('/Company/Detail');
    expect(first.deadline).toBe('상시');
    expect(first.registeredAtText).toBe('16시간 전 등록');
    expect(first.tags.length).toBeGreaterThan(0);
  });

  it('잘못된 HTML이면 빈 배열을 반환한다', () => {
    expect(parseJobList('<html><body>no jobs</body></html>')).toEqual([]);
  });

  it('onclick에서 직군 라벨을 추출한다', () => {
    const first = parseJobList(html)[0];
    expect(first.sourceId).toBe('280518');
    expect(first.jobFamilies).toEqual([
      '인터페이스 디자인',
      '원화',
      '애니메이션',
      '이펙트·FX',
    ]);
  });

  it('픽스처 40건 모두 직군이 비어 있지 않다', () => {
    const jobs = parseJobList(html);
    expect(jobs.length).toBe(40);
    expect(jobs.every((j) => j.jobFamilies.length > 0)).toBe(true);
  });

  it('원화 직군이 픽스처 전 건에 달려 있다', () => {
    const jobs = parseJobList(html);
    expect(jobs.filter((j) => j.jobFamilies.includes('원화')).length).toBe(40);
  });

  it('장르·지역을 직군으로 잘못 읽지 않는다', () => {
    const jobs = parseJobList(html);
    const all = jobs.flatMap((j) => j.jobFamilies);
    expect(all).not.toContain('모바일게임');
    expect(all).not.toContain('온라인PC게임');
    expect(all.some((f) => f.includes('>'))).toBe(false);
  });
});

describe('parseTotalPages', () => {
  it('totalJobcnt 기반으로 총 페이지 수를 계산한다', () => {
    expect(parseTotalPages(html)).toBeGreaterThanOrEqual(1);
  });

  it('266건이면 ceil(266/40) = 7 페이지를 반환한다', () => {
    expect(parseTotalPages(html)).toBe(7);
  });

  it('공고 수가 없으면 1을 반환한다', () => {
    expect(parseTotalPages('<html><body></body></html>')).toBe(1);
  });

  it('콤마가 포함된 공고 수도 올바르게 계산한다', () => {
    const html = '<span class="totalJobcnt">(1,266)</span>';
    expect(parseTotalPages(html)).toBe(32); // ceil(1266 / 40)
  });
});
