import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SaraminScraperService,
  SARAMIN_QUERIES,
} from './saramin-scraper.service';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/saramin-search.html'),
  'utf-8',
);

const okResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

describe('SaraminScraperService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('세 개의 질의를 보낸다', async () => {
    const urls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      urls.push(String(url));
      return Promise.resolve(okResponse(html));
    });

    await new SaraminScraperService().fetchJobList(1);

    expect(SARAMIN_QUERIES).toEqual(['게임 원화', '캐릭터 원화', '원화가']);
    expect(urls.length).toBe(3);
    for (const q of SARAMIN_QUERIES) {
      expect(
        urls.some((u) =>
          u.includes(encodeURIComponent(q).replace(/%20/g, '+')),
        ),
      ).toBe(true);
    }
  });

  it('질의 간 중복 공고를 sourceId 로 합친다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(html));

    const result = await new SaraminScraperService().fetchJobList(1);
    const ids = result.jobs.map((j) => j.sourceId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('한 질의가 실패해도 나머지를 돌려준다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      if (n === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(html));
    });

    const result = await new SaraminScraperService().fetchJobList(1);

    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it('전 질의가 실패하면 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));

    await expect(new SaraminScraperService().fetchJobList(1)).rejects.toThrow();
  });
});
