/** 동시 실행 개수를 max로 제한하는 간단한 세마포어. */
export function createLimiter(max: number) {
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError(`createLimiter: max must be an integer >= 1, got ${max}`);
  }
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    queue.shift()!();
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        // Promise.resolve().then(...)로 감싸 task의 동기 throw도 reject로 흘려보낸다.
        // 그래야 finally가 항상 실행되어 active 누수(슬롯 영구 점유)를 막는다.
        Promise.resolve()
          .then(() => task())
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
