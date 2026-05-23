import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobDetail } from './gamejob-detail-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-detail.html'),
  'utf-8',
);

describe('parseJobDetail', () => {
  it('회사 로고 URL을 절대 https로 추출한다', () => {
    const r = parseJobDetail(html);
    expect(r.companyLogoUrl).toBeTruthy();
    expect(r.companyLogoUrl).toMatch(/^https:\/\/file\.gamejob\.co\.kr\/.*CoImage\/LogoView/);
  });

  it('회사 사진 4장을 절대 https로 추출한다', () => {
    const r = parseJobDetail(html);
    expect(r.companyPhotos).toHaveLength(4);
    for (const url of r.companyPhotos) {
      expect(url).toMatch(/^https:\/\/file\.gamejob\.co\.kr\/.*CoImage\/VIew/);
    }
  });

  it("대표게임이 '-'이면 빈 배열을 반환한다 (실제 픽스처)", () => {
    expect(parseJobDetail(html).representativeGames).toEqual([]);
  });

  it('대표게임 콤마 구분 텍스트를 분리한다 (합성 입력)', () => {
    const synthetic = `
      <html><body>
        <dl class="recruit-data-item">
          <dt class="recruit-data-title">대표게임</dt>
          <dd class="recruit-data-text">락앤캐쉬, 슬롯메이트, 애니팡포커, 애니팡맞고</dd>
        </dl>
      </body></html>`;
    expect(parseJobDetail(synthetic).representativeGames).toEqual([
      '락앤캐쉬',
      '슬롯메이트',
      '애니팡포커',
      '애니팡맞고',
    ]);
  });

  it('비어 있는 HTML이면 모두 빈 값을 반환한다', () => {
    expect(parseJobDetail('<html><body></body></html>')).toEqual({
      companyLogoUrl: null,
      companyPhotos: [],
      representativeGames: [],
    });
  });
});
