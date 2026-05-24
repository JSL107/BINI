import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIncruitDetail } from './incruit-detail.service';

const html = readFileSync(join(__dirname, '../../test/fixtures/incruit-detail.html'), 'utf-8');

describe('parseIncruitDetail', () => {
  it('빈 HTML이면 모두 빈 값', () => {
    expect(parseIncruitDetail('<html></html>')).toEqual({
      companyLogoUrl: null,
      companyPhotos: [],
      representativeGames: [],
      bodyImages: [],
    });
  });

  it('l.incru.it 로고와 c.incru.it/newjobpost 배너를 분리 추출', () => {
    const synthetic = `
      <html><body>
        <img src="//l.incru.it/2024/01/test-logo.jpg" />
        <img src="//c.incru.it/newjobpost/2026/banner/x.png" />
        <img src="//c.incru.it/ad_banner/skip-this.png" />
      </body></html>
    `;
    const r = parseIncruitDetail(synthetic);
    expect(r.companyLogoUrl).toBe('https://l.incru.it/2024/01/test-logo.jpg');
    expect(r.bodyImages).toEqual(['https://c.incru.it/newjobpost/2026/banner/x.png']);
    expect(r.companyPhotos).toEqual([]);
    expect(r.representativeGames).toEqual([]);
  });

  it('실 fixture에서 throw 없이 파싱', () => {
    expect(() => parseIncruitDetail(html)).not.toThrow();
    const r = parseIncruitDetail(html);
    if (r.companyLogoUrl) {
      expect(r.companyLogoUrl).toMatch(/^https:\/\/l\.incru\.it\//);
    }
    for (const url of r.bodyImages) {
      expect(url).toMatch(/^https:\/\/c\.incru\.it\/newjobpost\//);
    }
  });
});
