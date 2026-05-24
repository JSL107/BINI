import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findVerifiedImageUrl,
  parseFirstImageUrl,
  parseImageCandidates,
} from './naver-image';

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

describe('parseImageCandidates', () => {
  it('같은 JSON 객체 안의 originalUrl + linkUrl을 페어로 묶는다', () => {
    const sample = `
      {"originalUrl":"https://i.example.com/a.jpg","linkUrl":"https://blog.example.com/p/1"}
      {"originalUrl":"https://i.example.com/b.jpg","linkUrl":"https://blog.example.com/p/2"}
    `;
    const c = parseImageCandidates(sample);
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({
      imageUrl: 'https://i.example.com/a.jpg',
      pageUrl: 'https://blog.example.com/p/1',
    });
    expect(c[1].pageUrl).toBe('https://blog.example.com/p/2');
  });

  it('페어가 안 잡힌 결과는 pageUrl=null로 단방향 fallback에 포함된다', () => {
    const sample = `
      {"originalUrl":"https://i.example.com/lone.jpg","otherField":"x"}
    `;
    const c = parseImageCandidates(sample);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual({
      imageUrl: 'https://i.example.com/lone.jpg',
      pageUrl: null,
    });
  });

  it('객체 boundary를 넘는 페어는 매칭되지 않는다 (lazy [^{}])', () => {
    const sample = `
      {"originalUrl":"https://i.example.com/a.jpg"}
      {"linkUrl":"https://blog.example.com/different"}
    `;
    const c = parseImageCandidates(sample);
    // a.jpg는 단방향 후보로만 채택, linkUrl은 originalUrl이 페어를 이루는 객체 안에 없어 무시.
    expect(c).toHaveLength(1);
    expect(c[0].pageUrl).toBeNull();
  });

  it('http URL은 mixed-content 위험으로 컷한다', () => {
    const sample = `{"originalUrl":"http://insecure.example.com/x.jpg"}`;
    expect(parseImageCandidates(sample)).toEqual([]);
  });

  it('커뮤니티 도메인 결과는 차단된다', () => {
    const sample = `
      {"originalUrl":"https://www.inven.co.kr/files/x.jpg","linkUrl":"https://inven.co.kr/p"}
      {"originalUrl":"https://i.example.com/ok.jpg","linkUrl":"https://example.com/p"}
    `;
    const c = parseImageCandidates(sample);
    expect(c).toHaveLength(1);
    expect(c[0].imageUrl).toBe('https://i.example.com/ok.jpg');
  });

  it('중복 URL은 제거된다 (페어 매칭 후 단방향에서 같은 게 또 잡혀도)', () => {
    const sample = `
      {"originalUrl":"https://i.example.com/a.jpg","linkUrl":"https://p1.example.com"}
      {"originalUrl":"https://i.example.com/a.jpg","linkUrl":"https://p2.example.com"}
    `;
    const c = parseImageCandidates(sample);
    expect(c).toHaveLength(1);
    // 첫 페어가 채택됨.
    expect(c[0].pageUrl).toBe('https://p1.example.com');
  });
});

describe('findVerifiedImageUrl', () => {
  // verifyPageContainsText의 fetch는 unit test에서 globalThis.fetch를 모킹.
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchTitle(map: Record<string, string>) {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const title = map[url];
      if (title === undefined) {
        return new Response('not found', { status: 404 });
      }
      return new Response(`<html><head><title>${title}</title></head><body></body></html>`, {
        status: 200,
      });
    }) as unknown as typeof fetch;
  }

  it('출처 페이지 title에 verifyText가 있으면 첫 후보 채택', async () => {
    mockFetchTitle({ 'https://p1.example.com/x': '나이트 크로우 공식 페이지' });
    const got = await findVerifiedImageUrl(
      [{ imageUrl: 'https://i.example.com/a.jpg', pageUrl: 'https://p1.example.com/x' }],
      '나이트 크로우',
    );
    expect(got).toBe('https://i.example.com/a.jpg');
  });

  it('검증 실패면 다음 후보 시도', async () => {
    mockFetchTitle({
      'https://p1.example.com/x': '던전앤파이터 리뷰',
      'https://p2.example.com/y': '나이트 크로우 정보',
    });
    const got = await findVerifiedImageUrl(
      [
        { imageUrl: 'https://i.example.com/a.jpg', pageUrl: 'https://p1.example.com/x' },
        { imageUrl: 'https://i.example.com/b.jpg', pageUrl: 'https://p2.example.com/y' },
      ],
      '나이트 크로우',
    );
    expect(got).toBe('https://i.example.com/b.jpg');
  });

  it('pageUrl=null 후보는 검증 skip하고 그대로 채택 (커버리지 트레이드)', async () => {
    const got = await findVerifiedImageUrl(
      [{ imageUrl: 'https://i.example.com/lone.jpg', pageUrl: null }],
      '아무거나',
    );
    expect(got).toBe('https://i.example.com/lone.jpg');
  });

  it('모든 후보가 검증 fail이면 null', async () => {
    mockFetchTitle({
      'https://p1.example.com/x': '관련 없는 페이지',
    });
    const got = await findVerifiedImageUrl(
      [{ imageUrl: 'https://i.example.com/a.jpg', pageUrl: 'https://p1.example.com/x' }],
      '나이트 크로우',
    );
    expect(got).toBeNull();
  });
});
