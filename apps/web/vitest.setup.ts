import '@testing-library/jest-dom/vitest';

// jsdom은 IntersectionObserver를 구현하지 않음. lazy-load 류 컴포넌트가 마운트
// 즉시 onIntersect를 한 번 호출하도록 단순 stub — 테스트는 "viewport 안에 들어왔다"
// 가정으로 진행.
class StubIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(private cb: IntersectionObserverCallback) {}
  observe = (target: Element) => {
    queueMicrotask(() => {
      this.cb(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this,
      );
    });
  };
  unobserve = () => {};
  disconnect = () => {};
  takeRecords = () => [];
}
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  window.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver;
}
