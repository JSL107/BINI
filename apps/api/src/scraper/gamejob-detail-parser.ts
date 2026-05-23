import * as cheerio from 'cheerio';

const BASE = 'https://www.gamejob.co.kr';

// GameJob CDN URL paths. The photo path is intentionally `VIew` (capital V, lowercase
// i, lowercase ew) on GameJob's side — likely a server-side typo, but stable. If they
// ever normalize this casing, extraction silently returns 0 photos; the parser tests
// against the captured fixture would catch the regression on the next CI run.
const LOGO_PATH_HINT = 'CoImage/LogoView';
const PHOTO_PATH_HINT = 'CoImage/VIew';

export interface JobDetailExtract {
  /** Company logo URL from `CoImage/LogoView`, absolute https. Null if not found. */
  companyLogoUrl: string | null;
  /** Company photos from `CoImage/VIew` slots (up to 4), absolute https, deduped, in document order. */
  companyPhotos: string[];
  /** 대표게임 entries (split by ',' and trimmed). Empty when GameJob lists "-" or nothing. */
  representativeGames: string[];
}

/**
 * Normalize an HTML `src` attribute to an absolute https URL. GameJob's
 * `CoImage/VIew?FN=…` URLs sometimes carry Windows-style backslashes inside
 * the `FN=` query parameter, which are invalid per RFC 3986 and rejected by
 * some HTTP clients/CDN edge nodes. Replace them with forward slashes.
 */
function abs(src: string | undefined | null): string | null {
  if (!src) return null;
  const cleaned = src.replace(/\\/g, '/');
  if (cleaned.startsWith('//')) return 'https:' + cleaned;
  if (cleaned.startsWith('http://')) return 'https://' + cleaned.slice('http://'.length);
  if (cleaned.startsWith('https://')) return cleaned;
  if (cleaned.startsWith('/')) return BASE + cleaned;
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
    .find((s) => s.includes(LOGO_PATH_HINT));
  const companyLogoUrl = abs(logoSrc);

  // Company photos — GameJob's detail page slideshow caps at 4. Enforce here so
  // a malformed company page (uploaded extras, lazy duplicates) doesn't bloat
  // the modal's "회사 사진" tab. Document order preserved.
  const COMPANY_PHOTO_MAX = 4;
  const companyPhotos: string[] = [];
  const seen = new Set<string>();
  $('img').each((_, el) => {
    if (companyPhotos.length >= COMPANY_PHOTO_MAX) return false;
    const url = abs($(el).attr('src'));
    if (url && url.includes(PHOTO_PATH_HINT) && !seen.has(url)) {
      seen.add(url);
      companyPhotos.push(url);
    }
    return undefined;
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
