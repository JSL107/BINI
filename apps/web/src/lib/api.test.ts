import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJobs, fetchGameImage } from './api';

afterEach(() => vi.restoreAllMocks());

describe('fetchJobs', () => {
  it('page 쿼리로 jobs 엔드포인트를 호출한다', async () => {
    const json = { page: 2, totalPages: 5, jobs: [] };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    );
    const result = await fetchJobs(2);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/jobs?page=2'),
      expect.anything(),
    );
    expect(result).toEqual(json);
  });

  it('HTTP 에러 응답이면 throw한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
    await expect(fetchJobs(1)).rejects.toThrow();
  });
});

describe('fetchGameImage', () => {
  it('검색어와 타입을 game-image 엔드포인트에 전달한다', async () => {
    const json = { query: '원신 게임', imageUrl: 'https://i/x.jpg', status: 'found' };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    );
    const result = await fetchGameImage('원신 게임', 'game');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/game-image?q=%EC%9B%90%EC%8B%A0%20%EA%B2%8C%EC%9E%84&type=game',
      ),
      expect.anything(),
    );
    expect(result.imageUrl).toBe('https://i/x.jpg');
  });
});
