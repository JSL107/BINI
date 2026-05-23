import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import type { ImageProvider, ImageResult } from './image-provider';
import { createLimiter } from './limit';

/**
 * Google 이미지 검색을 헤드리스 Chromium(Playwright)으로 크롤링한다.
 * API 키 없이 동작 — `udm=2` 이미지 모드 페이지를 실제 브라우저로 렌더링해 결과 URL을 뽑는다.
 *
 * 활성화: 기본 ON. 비활성화하려면 `GOOGLE_CRAWLER=0`.
 * 로컬 전용 — Vercel 서버리스에는 chromium 바이너리가 없어 동작 불가
 * (그쪽은 GoogleImageService(CSE API) 또는 Naver 폴백을 쓴다).
 *
 * 성능:
 *   - 검색당 ~2-4초 (첫 호출은 브라우저 spawn ~3-5초 추가).
 *   - 동시 3개로 제한 — Chromium 메모리 부담 + Google 봇 탐지 회피.
 *   - 결과는 `game_images` 테이블에 캐시되어 같은 검색어는 1회만 호출.
 */
@Injectable()
export class GoogleCrawlerImageService implements ImageProvider, OnModuleDestroy {
  readonly source = 'google-crawler';
  private readonly logger = new Logger(GoogleCrawlerImageService.name);
  private readonly limit = createLimiter(3);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  /** 명시적으로 끄지 않은 한 활성. */
  isConfigured(): boolean {
    return process.env.GOOGLE_CRAWLER !== '0';
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  search(query: string): Promise<ImageResult> {
    return this.limit(() => this.doSearch(query));
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;
    this.launching = chromium
      .launch({ headless: true })
      .then((b) => {
        this.browser = b;
        this.launching = null;
        this.logger.log('headless chromium launched');
        return b;
      })
      .catch((err) => {
        this.launching = null;
        throw err;
      });
    return this.launching;
  }

  private async doSearch(query: string): Promise<ImageResult> {
    if (!this.isConfigured()) {
      return { imageUrl: null, status: 'error' };
    }
    let context: Awaited<ReturnType<Browser['newContext']>> | null = null;
    try {
      const browser = await this.ensureBrowser();
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        locale: 'ko-KR',
        viewport: { width: 1366, height: 900 },
      });
      const page = await context.newPage();
      const url =
        'https://www.google.com/search?udm=2&hl=ko&q=' +
        encodeURIComponent(query);

      await page.goto(url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
      // Wait for any image thumbnail to render.
      await page
        .waitForSelector(
          'img[src^="https://encrypted-tbn"], img[src^="https://lh"]',
          { timeout: 8_000 },
        )
        .catch(() => undefined);

      const imgUrl = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('img'));
        for (const img of candidates) {
          const src = img.getAttribute('src') ?? img.getAttribute('data-src');
          if (!src) continue;
          // Google's CDN-hosted thumbnails are stable and hotlinkable from the browser.
          if (
            src.startsWith('https://encrypted-tbn') ||
            src.startsWith('https://lh3.googleusercontent.com') ||
            src.startsWith('https://lh4.googleusercontent.com') ||
            src.startsWith('https://lh5.googleusercontent.com') ||
            src.startsWith('https://lh6.googleusercontent.com')
          ) {
            return src;
          }
        }
        return null;
      });

      if (imgUrl) {
        return { imageUrl: imgUrl, status: 'found' };
      }
      return { imageUrl: null, status: 'not_found' };
    } catch (err) {
      this.logger.warn(`Google crawler error for "${query}": ${String(err)}`);
      return { imageUrl: null, status: 'error' };
    } finally {
      if (context) {
        await context.close().catch(() => undefined);
      }
    }
  }
}
