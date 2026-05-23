/**
 * 나무위키 게임 페이지에서 대표 이미지 URL을 추출한다.
 *
 * 페이지 URL: `https://namu.wiki/w/<encoded gameName>`
 *
 * 나무위키는 React 기반 SPA라 정적 fetch로는 본문이 안 잡힌다 — Playwright 필수.
 *
 * 추출 전략 (우선순위 순):
 *   1) `.wiki-paragraph` 안의 첫 `img[src*="i.namu.wiki"]` — 정보상자/본문 최상단 이미지
 *   2) 일반 `img[src*="i.namu.wiki"]` 중 가장 큰 것 (width*height heuristic)
 *
 * 차단 감지: 나무위키도 봇 트래픽에 captcha/차단 페이지를 띄울 수 있다. 본문이
 * 비어 있거나 페이지 타이틀이 차단성 키워드를 포함하면 `blocked` 반환.
 *
 * 동음이의: "프로젝트 ES" 같은 코드네임은 나무위키에 페이지가 없거나 다른 의미의
 * 페이지로 리다이렉트될 수 있다. 페이지가 redirect되어 들어간 항목 제목이 검색
 * 게임명과 너무 다르면 not_found 처리 (heuristic — 미구현, 일단 첫 이미지 추출).
 */

import type { BrowserContext } from 'playwright';

export interface NamuwikiResult {
  imageUrl: string | null;
  /** 'found' — 이미지 추출 성공. 'not_found' — 페이지 자체가 없거나 이미지 없음. 'blocked' — 차단 감지. */
  status: 'found' | 'not_found' | 'blocked';
}

const PAGE_TIMEOUT_MS = 20_000;

export async function fetchNamuwikiImage(
  context: BrowserContext,
  gameName: string,
): Promise<NamuwikiResult> {
  const page = await context.newPage();
  try {
    const url = 'https://namu.wiki/w/' + encodeURIComponent(gameName);
    const res = await page
      .goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
      .catch(() => null);

    // 404 — 페이지 없음
    if (res && res.status() === 404) {
      return { imageUrl: null, status: 'not_found' };
    }

    // 봇 차단: 나무위키는 봇 감지 시 Cloudflare/자체 차단 페이지를 띄움.
    const finalUrl = page.url();
    if (/\/(?:robots-check|sorry|blocked|captcha)/i.test(finalUrl)) {
      return { imageUrl: null, status: 'blocked' };
    }

    // 본문이 로드될 때까지 잠깐 대기. 셀렉터가 없어도 그냥 진행.
    await page
      .waitForSelector('img[src*="i.namu.wiki"], .wiki-paragraph', {
        timeout: 8_000,
      })
      .catch(() => undefined);

    const imageUrl = await page.evaluate(() => {
      const isCandidate = (img: HTMLImageElement): boolean => {
        const src = img.getAttribute('src') ?? '';
        if (!src.includes('i.namu.wiki')) return false;
        // 이모지/아이콘 컬렉션 이미지 제외 (보통 매우 작음).
        const rect = img.getBoundingClientRect();
        return rect.width >= 100 && rect.height >= 100;
      };

      // 첫 wiki-paragraph 안의 첫 후보가 일반적으로 정보상자 메인 이미지.
      const paragraphImgs = Array.from(
        document.querySelectorAll<HTMLImageElement>('.wiki-paragraph img'),
      );
      for (const img of paragraphImgs) {
        if (isCandidate(img)) return img.getAttribute('src');
      }

      // Fallback: 페이지 전체에서 가장 큰 i.namu.wiki 이미지.
      const all = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter(
        isCandidate,
      );
      if (all.length === 0) return null;
      all.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });
      return all[0].getAttribute('src');
    });

    if (!imageUrl) {
      return { imageUrl: null, status: 'not_found' };
    }

    // 절대 URL 정규화 (`//i.namu.wiki/...` 형태일 수도 있다).
    let absolute = imageUrl;
    if (absolute.startsWith('//')) absolute = 'https:' + absolute;
    if (absolute.startsWith('http://')) {
      absolute = 'https://' + absolute.slice('http://'.length);
    }
    if (!absolute.startsWith('https://')) {
      return { imageUrl: null, status: 'not_found' };
    }
    return { imageUrl: absolute, status: 'found' };
  } finally {
    await page.close().catch(() => undefined);
  }
}
