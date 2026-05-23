import * as cheerio from 'cheerio';

const BASE = 'https://www.gamejob.co.kr';

export interface JobDetailExtract {
  /** Company logo URL from `CoImage/LogoView`, absolute https. Null if not found. */
  companyLogoUrl: string | null;
  /** Company photos from `CoImage/VIew` slots (up to 4), absolute https, deduped, in document order. */
  companyPhotos: string[];
  /** 대표게임 entries (split by ',' and trimmed). Empty when GameJob lists "-" or nothing. */
  representativeGames: string[];
}

function abs(src: string | undefined | null): string | null {
  if (!src) return null;
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('http')) return src;
  if (src.startsWith('/')) return BASE + src;
  return null;
}

/**
 * Parse a GameJob job-detail HTML page (path `/Recruit/GI_Read/View?GI_No=<id>`)
 * and extract the company logo, the company-photo slideshow images, and the
 * 대표게임 list. All values are best-effort — missing fields return null/[].
 */
export function parseJobDetail(html: string): JobDetailExtract {
  const $ = cheerio.load(html);

  // Logo
  const logoSrc = $('img')
    .toArray()
    .map((el) => $(el).attr('src') ?? '')
    .find((s) => s.includes('CoImage/LogoView'));
  const companyLogoUrl = abs(logoSrc);

  // Company photos
  const companyPhotos: string[] = [];
  const seen = new Set<string>();
  $('img').each((_, el) => {
    const url = abs($(el).attr('src'));
    if (url && url.includes('CoImage/VIew') && !seen.has(url)) {
      seen.add(url);
      companyPhotos.push(url);
    }
  });

  // 대표게임 — labelled by <dt class="recruit-data-title">대표게임</dt>,
  // value in the next <dd class="recruit-data-text">. GameJob renders "-" when empty.
  const representativeGames: string[] = [];
  $('dt.recruit-data-title').each((_, el) => {
    if ($(el).text().trim() === '대표게임') {
      const text = $(el).next('dd.recruit-data-text').text().trim();
      if (text && text !== '-') {
        for (const piece of text.split(',')) {
          const name = piece.trim();
          if (name) representativeGames.push(name);
        }
      }
    }
  });

  return { companyLogoUrl, companyPhotos, representativeGames };
}
