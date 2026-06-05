import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { JobDetailExtract } from './gamejob-detail-parser';
import { BROWSER_UA } from './http-constants';

const FETCH_TIMEOUT_MS = 8_000;

const EMPTY: JobDetailExtract = {
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
  bodyImages: [],
};

/**
 * 잡코리아 잡 상세 페이지 + 본문 iframe에서 이미지를 추출.
 *
 * URL 패턴:
 *   - 메인: `https://www.jobkorea.co.kr/Recruit/GI_Read/<id>`
 *     → `file2.jobkorea.co.kr/Net/Mng/Image/LogoImage?FN=...` 로 회사 로고 들어있음.
 *   - 본문 iframe: `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=<id>`
 *     게임잡과 거의 동일한 구조(파라미터만 GI_No → Gno). 회사가 직접 업로드한
 *     본문 광고/배너 이미지가 들어있다(없는 잡도 많음).
 *
 * Best-effort — 어느 쪽이 실패해도 빈 슬라이스 반환.
 */
@Injectable()
export class JobkoreaDetailService {
  private readonly logger = new Logger(JobkoreaDetailService.name);

  async fetchDetail(jobId: string): Promise<JobDetailExtract> {
    const [main, body] = await Promise.all([
      this.fetchMain(jobId),
      this.fetchBodyImages(jobId),
    ]);
    return { ...main, bodyImages: body };
  }

  private async fetchMain(jobId: string): Promise<JobDetailExtract> {
    const url = `https://www.jobkorea.co.kr/Recruit/GI_Read/${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`jobkorea detail HTTP ${res.status} for Gno=${jobId}`);
        return EMPTY;
      }
      return parseJobkoreaMain(await res.text());
    } catch (err) {
      this.logger.warn(
        `jobkorea detail fetch error for Gno=${jobId}: ${String(err)}`,
      );
      return EMPTY;
    }
  }

  private async fetchBodyImages(jobId: string): Promise<string[]> {
    const url = `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: `https://www.jobkorea.co.kr/Recruit/GI_Read/${encodeURIComponent(jobId)}`,
        },
      });
      if (!res.ok) {
        this.logger.warn(
          `jobkorea body iframe HTTP ${res.status} for Gno=${jobId}`,
        );
        return [];
      }
      return parseJobkoreaBodyImages(await res.text());
    } catch (err) {
      this.logger.warn(
        `jobkorea body iframe fetch error for Gno=${jobId}: ${String(err)}`,
      );
      return [];
    }
  }
}

function abs(src: string | undefined | null): string | null {
  if (!src) return null;
  const cleaned = src.replace(/\\/g, '/');
  if (cleaned.startsWith('//')) return 'https:' + cleaned;
  if (cleaned.startsWith('http://'))
    return 'https://' + cleaned.slice('http://'.length);
  if (cleaned.startsWith('https://')) return cleaned;
  if (cleaned.startsWith('/')) return 'https://www.jobkorea.co.kr' + cleaned;
  return null;
}

/**
 * 잡코리아가 회사가 자체 로고를 안 올린 잡에 자동으로 채워넣는 placeholder
 * 로고 파일명 패턴. URL-encoded 또는 raw 둘 다 매칭한다.
 *   - `잡코리아 로고_*.png` (raw 한글)
 *   - `%EC%9E%A1%EC%BD%94%EB%A6%AC%EC%95%84` ("잡코리아" URL-encoded)
 *   - `JK_Logo` / `jobkorea_logo` 영문 변형
 */
function isJobkoreaPlaceholderLogo(url: string): boolean {
  // FN= 파라미터를 디코딩해 파일명 검사
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // 디코드 실패 시 원본으로
  }
  if (/잡코리아\s*로고/i.test(decoded)) return true;
  if (/%EC%9E%A1%EC%BD%94%EB%A6%AC%EC%95%84/i.test(url)) return true;
  if (/JK_Logo|jobkorea[_\s]*logo/i.test(decoded)) return true;
  return false;
}

export function parseJobkoreaMain(html: string): JobDetailExtract {
  const $ = cheerio.load(html);

  // 회사 로고: file*.jobkorea.co.kr/.../LogoImage?FN=... 첫 매치.
  // 단 잡코리아의 fallback placeholder(`잡코리아 로고_1.png`)는 회사 식별에
  // 도움이 안 되므로 null로 떨어뜨린다.
  let companyLogoUrl: string | null = null;
  $('img').each((_, el) => {
    if (companyLogoUrl) return false;
    const url = abs($(el).attr('src'));
    if (url && /file\d?\.jobkorea\.co\.kr\/.+\/LogoImage/i.test(url)) {
      if (isJobkoreaPlaceholderLogo(url)) return undefined; // 다음 img 시도
      companyLogoUrl = url;
      return false;
    }
    return undefined;
  });

  return {
    companyLogoUrl,
    companyPhotos: [],
    representativeGames: [],
    bodyImages: [],
  };
}

export function parseJobkoreaBodyImages(html: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  const seen = new Set<string>();
  $('img').each((_, el) => {
    const url = abs($(el).attr('src'));
    if (!url) return;
    // 트래커/픽셀 제외
    if (
      /(googletagmanager|google-analytics|doubleclick|gtag|gtm\.|criteo)/i.test(
        url,
      )
    ) {
      return;
    }
    // 일반 이미지 확장자 또는 잡코리아 본문 이미지 호스트.
    const looksLikeImage =
      /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url) ||
      /file\d?\.jobkorea\.co\.kr/.test(url);
    if (!looksLikeImage) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  });
  return out;
}
