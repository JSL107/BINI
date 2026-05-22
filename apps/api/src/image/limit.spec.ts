import { createLimiter } from './limit';

describe('createLimiter', () => {
  it('동시 실행 개수를 max로 제한한다', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    await Promise.all(Array.from({ length: 6 }, task));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('모든 작업의 결과를 순서대로 반환한다', async () => {
    const limit = createLimiter(2);
    const results = await Promise.all([1, 2, 3].map((n) => limit(async () => n * 2)));
    expect(results).toEqual([2, 4, 6]);
  });
});
