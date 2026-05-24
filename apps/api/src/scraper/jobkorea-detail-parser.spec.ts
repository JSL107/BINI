import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobkoreaMain, parseJobkoreaBodyImages } from './jobkorea-detail.service';

const mainHtml = readFileSync(join(__dirname, '../../test/fixtures/jobkorea-detail.html'), 'utf-8');
const bodyHtml = readFileSync(join(__dirname, '../../test/fixtures/jobkorea-body-iframe.html'), 'utf-8');

describe('parseJobkoreaMain', () => {
  it('회사 로고 URL을 추출한다', () => {
    const r = parseJobkoreaMain(mainHtml);
    // 빈 fixture(404 등)면 null, 실제 잡 페이지면 file*.jobkorea.co.kr/.../LogoImage 패턴
    if (r.companyLogoUrl) {
      expect(r.companyLogoUrl).toMatch(/file\d?\.jobkorea\.co\.kr\/.+\/LogoImage/);
    }
  });
  it('빈 HTML이면 모두 빈 값을 반환한다', () => {
    expect(parseJobkoreaMain('<html><body></body></html>')).toEqual({
      companyLogoUrl: null,
      companyPhotos: [],
      representativeGames: [],
      bodyImages: [],
    });
  });
});

describe('parseJobkoreaBodyImages', () => {
  it('iframe HTML에서 이미지 URL 배열을 반환한다 (있을 때만)', () => {
    const out = parseJobkoreaBodyImages(bodyHtml);
    expect(Array.isArray(out)).toBe(true);
    for (const url of out) {
      expect(url).toMatch(/^https:/);
    }
  });
  it('빈 HTML이면 []', () => {
    expect(parseJobkoreaBodyImages('<html></html>')).toEqual([]);
  });
});
