import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GamejobScraperService,
  ART_DUTY_CODES,
} from './gamejob-scraper.service';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-wonhwa-list.html'),
  'utf-8',
);

const okResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

describe('GamejobScraperService', () => {
  let service: GamejobScraperService;
  let calls: string[];

  beforeEach(() => {
    service = new GamejobScraperService();
    calls = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('아트 4개 직군을 요청한다', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      calls.push(String((init as RequestInit).body));
      return Promise.resolve(okResponse(html));
    });

    await service.fetchJobList(1);

    expect(calls.length).toBe(4);
    expect(ART_DUTY_CODES).toEqual(['5', '6', '7', '8']);
    for (const code of ART_DUTY_CODES) {
      expect(
        calls.some((body) => body.includes(`condition%5Bduty%5D=${code}`)),
      ).toBe(true);
    }
  });

  it('직군 간 중복 공고를 GI_No 로 합친다', async () => {
    // 4회 모두 같은 픽스처(40건) → 병합 후에도 40건이어야 한다.
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(html));

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
    const ids = result.jobs.map((j) => j.sourceId);
    expect(new Set(ids).size).toBe(40);
  });

  it('한 직군이 실패해도 나머지 결과를 돌려준다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      if (n === 2) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(html));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });

  it('전 직군이 실패하면 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));

    await expect(service.fetchJobList(1)).rejects.toThrow();
  });

  it('전 직군이 0건이면 구조 변경으로 보고 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('<html></html>'));

    await expect(service.fetchJobList(1)).rejects.toThrow(/구조 변경/);
  });

  it('일부 직군만 0건인 것은 정상으로 본다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      return Promise.resolve(okResponse(n === 1 ? html : '<html></html>'));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });
});
