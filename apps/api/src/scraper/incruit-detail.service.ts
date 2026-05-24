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
 * 인크루트 잡 상세 페이지에서 회사 로고와 잡 배너 이미지를 추출.
 *
 * URL 패턴 분석:
 *   - `l.incru.it/...` — 회사가 업로드한 로고 (정적 HTML에 직접 포함)
 *   - `c.incru.it/newjobpost/...` — 잡 배너 (회사 직접 큐레이션, bodyImages 적합)
 *   - `c.incru.it/ad_banner/...` — powerlink 광고 (skip)
 *   - `i.incru.it/ui/static/...` — UI 아이콘/SVG (skip)
 *
 * 사라민과 달리 정적 HTML SSR이라 Playwright 없이 직접 fetch 가능.
 * 인크루트 detail URL: `https://job.incruit.com/jobdb_info/jobpost.asp?job=<id>`
 *
 * Best-effort — 실패/타임아웃 시 EMPTY 반환.
 */
@Injectable()
export class IncruitDetailService {
  private readonly logger = new Logger(IncruitDetailService.name);

  async fetchDetail(jobId: string): Promise<JobDetailExtract> {
    const url = `https://job.incruit.com/jobdb_info/jobpost.asp?job=${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`incruit detail HTTP ${res.status} for job=${jobId}`);
        return EMPTY;
      }
      const html = await res.text();
      return parseIncruitDetail(html);
    } catch (err) {
      this.logger.warn(`incruit detail fetch error for job=${jobId}: ${String(err)}`);
      return EMPTY;
    }
  }
}

function abs(src: string | undefined | null): string | null {
  if (!src) return null;
  const cleaned = src.replace(/\\/g, '/');
  if (cleaned.startsWith('//')) return 'https:' + cleaned;
  if (cleaned.startsWith('http://')) return 'https://' + cleaned.slice('http://'.length);
  if (cleaned.startsWith('https://')) return cleaned;
  return null; // 인크루트는 prefix 없는 상대 경로를 직접 사용 안 함.
}

export function parseIncruitDetail(html: string): JobDetailExtract {
  const $ = cheerio.load(html);

  // 회사 로고: l.incru.it 호스트의 첫 이미지.
  let companyLogoUrl: string | null = null;
  $('img').each((_, el) => {
    if (companyLogoUrl) return false;
    const url = abs($(el).attr('src'));
    if (url && /\/\/l\.incru\.it\//.test(url)) {
      companyLogoUrl = url;
      return false;
    }
    return undefined;
  });

  // 본문 배너: c.incru.it/newjobpost/...  (ad_banner는 제외)
  const bodyImages: string[] = [];
  const seen = new Set<string>();
  $('img').each((_, el) => {
    const url = abs($(el).attr('src'));
    if (!url) return;
    if (!/\/\/c\.incru\.it\/newjobpost\//.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    bodyImages.push(url);
  });

  return {
    companyLogoUrl,
    companyPhotos: [],
    representativeGames: [],
    bodyImages,
  };
}
