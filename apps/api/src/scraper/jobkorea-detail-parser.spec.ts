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

  it('잡코리아 fallback 로고 (`잡코리아 로고_1.png`)는 회사 로고로 채택하지 않는다', () => {
    const synthetic = `
      <html><body>
        <img src="https://file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=2026/05/잡코리아 로고_1.png">
      </body></html>
    `;
    expect(parseJobkoreaMain(synthetic).companyLogoUrl).toBeNull();
  });

  it('잡코리아 fallback이 먼저 있어도 그 뒤 실제 회사 로고가 있으면 그것을 채택한다', () => {
    const synthetic = `
      <html><body>
        <img src="https://file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=2026/05/잡코리아 로고_1.png">
        <img src="https://file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=2026/05/com2us.png">
      </body></html>
    `;
    expect(parseJobkoreaMain(synthetic).companyLogoUrl).toBe(
      'https://file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=2026/05/com2us.png',
    );
  });

  it('URL-encoded 잡코리아 placeholder도 컷한다', () => {
    const synthetic = `
      <html><body>
        <img src="https://file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=2026/05/%EC%9E%A1%EC%BD%94%EB%A6%AC%EC%95%84%20%EB%A1%9C%EA%B3%A0_1.png">
      </body></html>
    `;
    expect(parseJobkoreaMain(synthetic).companyLogoUrl).toBeNull();
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
