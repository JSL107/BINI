import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirstImageUrl } from './naver-image';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/naver-image-search.html'),
  'utf-8',
);

describe('parseFirstImageUrl', () => {
  it('네이버 검색결과 임베드 JSON에서 첫 originalUrl을 추출한다', () => {
    expect(parseFirstImageUrl(html)).toBe(
      'https://i.namu.wiki/i/MNk5ZUUw5E5ZVACmyvsCbbZm5moRYyKrbXvTg9Ui7SNs1IUpHsMtwH6Xq9dlTQBCaXpsFuhQ3L5WYvdYCDJSVA.webp',
    );
  });

  it('JSON 이스케이프(\\u0026)를 복원한다', () => {
    const sample = String.raw`{"originalUrl":"https://example.com/img?a=1&b=2"}`;
    expect(parseFirstImageUrl(sample)).toBe('https://example.com/img?a=1&b=2');
  });

  it('이미지가 없으면 null을 반환한다', () => {
    expect(parseFirstImageUrl('<html><body>no images</body></html>')).toBeNull();
  });
});
