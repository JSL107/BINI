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
    expect(peak).toBe(2);
  });

  it('각 작업의 반환값을 전달한다', async () => {
    const limit = createLimiter(2);
    const results = await Promise.all(
      [1, 2, 3].map((n) => limit(async () => n * 2)),
    );
    expect(results).toEqual([2, 4, 6]);
  });

  it('실패(reject)한 작업도 슬롯을 반환해 다음 작업이 진행된다', async () => {
    const limit = createLimiter(1);
    await expect(
      limit(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail');
    await expect(limit(async () => 42)).resolves.toBe(42);
  });

  it('동기적으로 throw하는 작업도 슬롯을 반환한다', async () => {
    const limit = createLimiter(1);
    await expect(
      limit((() => {
        throw new Error('sync');
      }) as () => Promise<never>),
    ).rejects.toThrow('sync');
    await expect(limit(async () => 7)).resolves.toBe(7);
  });

  it('max가 1 미만이면 RangeError를 던진다', () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
  });
});
