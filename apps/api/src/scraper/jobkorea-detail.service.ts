import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { JobDetailExtract } from './gamejob-detail-parser';

const FETCH_TIMEOUT_MS = 8_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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
          'User-Agent': UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`jobkorea detail HTTP ${res.status} for Gno=${jobId}`);
        return EMPTY;
      }
      return parseJobkoreaMain(await res.text());
    } catch (err) {
      this.logger.warn(`jobkorea detail fetch error for Gno=${jobId}: ${String(err)}`);
      return EMPTY;
    }
  }

  private async fetchBodyImages(jobId: string): Promise<string[]> {
    const url = `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: `https://www.jobkorea.co.kr/Recruit/GI_Read/${encodeURIComponent(jobId)}`,
        },
      });
      if (!res.ok) {
        this.logger.warn(`jobkorea body iframe HTTP ${res.status} for Gno=${jobId}`);
        return [];
      }
      return parseJobkoreaBodyImages(await res.text());
    } catch (err) {
      this.logger.warn(`jobkorea body iframe fetch error for Gno=${jobId}: ${String(err)}`);
      return [];
    }
  }
}

function abs(src: string | undefined | null): string | null {
  if (!src) return null;
  const cleaned = src.replace(/\\/g, '/');
  if (cleaned.startsWith('//')) return 'https:' + cleaned;
  if (cleaned.startsWith('http://')) return 'https://' + cleaned.slice('http://'.length);
  if (cleaned.startsWith('https://')) return cleaned;
  if (cleaned.startsWith('/')) return 'https://www.jobkorea.co.kr' + cleaned;
  return null;
}

export function parseJobkoreaMain(html: string): JobDetailExtract {
  const $ = cheerio.load(html);

  // 회사 로고: file*.jobkorea.co.kr/.../LogoImage?FN=... 첫 매치.
  let companyLogoUrl: string | null = null;
  $('img').each((_, el) => {
    if (companyLogoUrl) return false;
    const url = abs($(el).attr('src'));
    if (url && /file\d?\.jobkorea\.co\.kr\/.+\/LogoImage/i.test(url)) {
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
    if (/(googletagmanager|google-analytics|doubleclick|gtag|gtm\.|criteo)/i.test(url)) {
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
