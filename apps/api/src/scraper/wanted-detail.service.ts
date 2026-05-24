import { Injectable, Logger } from '@nestjs/common';
import type { JobDetailExtract } from './gamejob-detail-parser';
import { BROWSER_UA } from './http-constants';

const FETCH_TIMEOUT_MS = 8_000;

/**
 * 원티드 잡 상세 API를 조회해 회사 로고 / 잡 키비주얼 / 회사 사진을 추출.
 *
 * 엔드포인트: `https://www.wanted.co.kr/api/v4/jobs/<id>` (인증 불필요)
 *
 * 응답 매핑 (게임잡 detail과 의미 매칭):
 *   - `logo_img.origin`  → companyLogoUrl
 *   - `title_img.origin` → bodyImages[0] (회사가 그 잡을 위해 큐레이션한 메인 키비주얼)
 *   - `company_images[].url` → companyPhotos
 *   - representativeGames는 원티드엔 직접 매핑되는 필드가 없어 [] 고정
 *
 * 디폴트 로고 필터: 원티드는 직군 placeholder 로고(`/images/wdes/0_4.png` 등)를
 * 회사 로고가 비어있을 때 자동 채워넣는다. 이런 placeholder는 회사 식별에
 * 도움이 안 되므로 null로 떨어뜨린다.
 *
 * Best-effort — 실패/타임아웃 시 EMPTY 반환.
 */

const EMPTY: JobDetailExtract = {
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
  bodyImages: [],
};

interface WantedImageObj {
  origin?: unknown;
  thumb?: unknown;
}

interface WantedCompanyImage {
  url?: unknown;
}

interface WantedJobDetail {
  logo_img?: WantedImageObj;
  title_img?: WantedImageObj;
  company_images?: WantedCompanyImage[];
}

interface WantedDetailResponse {
  job?: WantedJobDetail;
}

function pickHttps(obj: WantedImageObj | undefined): string | null {
  if (!obj) return null;
  const candidate = typeof obj.origin === 'string' ? obj.origin : null;
  if (!candidate) return null;
  if (!candidate.startsWith('https://')) return null;
  return candidate;
}

function isPlaceholderLogo(url: string): boolean {
  // 원티드 직군 placeholder 로고들 — wdes/0_<n>.png 패턴.
  return /\/images\/wdes\/0_\d+\./.test(url);
}

@Injectable()
export class WantedDetailService {
  private readonly logger = new Logger(WantedDetailService.name);

  async fetchDetail(jobId: string): Promise<JobDetailExtract> {
    const url = `https://www.wanted.co.kr/api/v4/jobs/${encodeURIComponent(jobId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`wanted detail HTTP ${res.status} for id=${jobId}`);
        return EMPTY;
      }
      const data = (await res.json()) as WantedDetailResponse;
      const job = data?.job;
      if (!job) return EMPTY;

      const rawLogo = pickHttps(job.logo_img);
      const companyLogoUrl =
        rawLogo && !isPlaceholderLogo(rawLogo) ? rawLogo : null;

      const titleImg = pickHttps(job.title_img);
      const bodyImages = titleImg ? [titleImg] : [];

      const companyPhotos: string[] = [];
      const seen = new Set<string>();
      // titleImg가 company_images에 또 들어있는 경우가 흔함 — dedup.
      if (titleImg) seen.add(titleImg);
      for (const ci of job.company_images ?? []) {
        const u = typeof ci?.url === 'string' ? ci.url : null;
        if (!u || !u.startsWith('https://')) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        companyPhotos.push(u);
      }

      return {
        companyLogoUrl,
        companyPhotos,
        representativeGames: [],
        bodyImages,
      };
    } catch (err) {
      this.logger.warn(`wanted detail fetch error for id=${jobId}: ${String(err)}`);
      return EMPTY;
    }
  }
}
