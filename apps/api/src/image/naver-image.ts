/**
 * 네이버 이미지 검색결과 HTML에서 이미지 URL을 추출하고, 필요시 출처 페이지의
 * 제목/OG 메타데이터를 검증해 검색어와 무관한 노이즈를 걸러낸다.
 *
 * 검증 (verifyText) 없이 호출하면 기존 동작 — 첫 https 결과를 그대로 반환.
 *
 * 필터:
 *   1) HTTPS만 — http URL은 (1) 브라우저 mixed-content 차단 (2) blogfiles 등은
 *      어차피 https 지원하므로 EUC-KR 인코딩의 오래된 http 결과를 의도적으로 skip.
 *   2) 신뢰도 낮은 커뮤니티 도메인 블록 — playwares/ruliweb 등 게임 토론 사이트
 *      첨부는 검색어와 무관한 다른 게임 스크린샷이 자주 포함됨.
 *   3) (verifyText 있을 때) 이미지가 등장하는 출처 페이지의 <title>/og:title에
 *      verifyText가 포함된 결과만 채택 — 동명이인 게임 노이즈를 줄임.
 */

const DOMAIN_BLOCKLIST = [
  // 게임 토론 커뮤니티 — 본 검색어와 무관한 첨부가 흔함
  'playwares.com',
  'bbs.ruliweb.com',
  'inven.co.kr',
  'fmkorea.com',
  'm.dcinside.com',
  // 카페·블로그도 마찬가지로 노이즈가 잦음. 단, blogfiles.naver.net 자체는
  // 결과 품질이 들쭉날쭉이라 통째 차단하지 않고 그대로 둔다 (https인 한 사용).
  // 금융/증권 — 게임 회사명이 종목명으로도 등장해 주가 차트가 첫 결과로
  // 잡히는 패턴을 컷 (예: "카카오게임즈" 검색 → 카카오게임즈 주가 차트).
  'finance.naver.com',
  'm.stock.naver.com',
  'finance.daum.net',
  'tossinvest.com',
  'kr.investing.com',
];

/**
 * URL의 path 패턴으로 차단 — 같은 도메인 안에서 특정 경로(주가/증권/금융
 * 이미지)만 거를 때. 호스트가 신뢰 도메인(naver/pstatic)이지만 path가
 * finance 경로인 케이스를 컷한다.
 */
const PATH_PATTERN_BLOCKLIST: RegExp[] = [
  /\/imgfinance\//i, // ssl.pstatic.net/imgfinance/charts/...
  /\/finance\/chart/i,
  /\/stock\/chart/i,
  /\/securities\//i,
  /stockchart/i,
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 페이지 검증 fetch — 같은 호스트에 너무 오래 매달리지 않도록 5초 컷. */
const VERIFY_TIMEOUT_MS = 5_000;

/** 검증 시도할 최대 후보 수. 너무 많이 fetch하면 latency 폭증. */
const VERIFY_MAX_CANDIDATES = 6;

function isBlockedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (DOMAIN_BLOCKLIST.some((b) => host === b || host.endsWith('.' + b))) {
      return true;
    }
    const pathQuery = u.pathname + u.search;
    if (PATH_PATTERN_BLOCKLIST.some((re) => re.test(pathQuery))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface NaverCandidate {
  imageUrl: string;
  /** 이미지가 등장하는 외부 페이지 URL (검증용). 페어가 잡히지 않으면 null. */
  pageUrl: string | null;
}

/**
 * 네이버 검색결과 HTML에서 `(originalUrl, linkUrl)` 페어를 가능한 만큼 추출한다.
 * 같은 JSON 객체 안에서만 페어링되도록 `[^{}]*?`로 객체 경계를 보수적으로 추정.
 * 페어가 안 잡히는 결과는 (단방향 fallback) 별도 정규식으로 image만이라도 수집한다.
 */
export function parseImageCandidates(html: string): NaverCandidate[] {
  const out: NaverCandidate[] = [];
  const seen = new Set<string>();
  const decodeJsonStr = (s: string): string | null => {
    try {
      const v = JSON.parse(`"${s}"`);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  };

  // 1) 페어 매칭 (originalUrl → linkUrl 순). lazy `[^{}]*?` 로 같은 객체 안만.
  const pairRe =
    /"originalUrl"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"linkUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(html)) !== null) {
    const imageUrl = decodeJsonStr(m[1]);
    const pageUrl = decodeJsonStr(m[2]);
    if (!imageUrl || !imageUrl.startsWith('https://')) continue;
    if (isBlockedUrl(imageUrl)) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    out.push({ imageUrl, pageUrl });
  }

  // 2) 페어 못 잡은 image들 (단방향) — pageUrl=null로 추가.
  const singleRe = /"originalUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  while ((m = singleRe.exec(html)) !== null) {
    const imageUrl = decodeJsonStr(m[1]);
    if (!imageUrl || !imageUrl.startsWith('https://')) continue;
    if (isBlockedUrl(imageUrl)) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    out.push({ imageUrl, pageUrl: null });
  }

  return out;
}

/** 기존 caller 유지용 단축 함수 — 첫 후보의 imageUrl만 반환. */
export function parseFirstImageUrl(html: string): string | null {
  const c = parseImageCandidates(html);
  return c.length > 0 ? c[0].imageUrl : null;
}

/**
 * 페이지 URL을 fetch해서 `<title>`/`<meta og:title>` 안에 `text`가 포함되는지
 * 확인. 공백/대소문자는 무시 (norm 비교).
 *
 * 실패(타임아웃·non-2xx·차단)는 false로 보수 처리 — caller가 다음 후보로 넘김.
 */
export async function verifyPageContainsText(
  pageUrl: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const html = await res.text();
    const og = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    );
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const haystackRaw = (og?.[1] || '') + ' ' + (title?.[1] || '');
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const needle = norm(text);
    if (needle.length === 0) return true;
    return norm(haystackRaw).includes(needle);
  } catch {
    return false;
  }
}

/**
 * 검색결과 후보들을 순서대로 검증해 통과한 첫 imageUrl을 반환. verifyText가
 * 빈 문자열이거나 후보에 pageUrl이 없으면 검증을 skip하고 그대로 채택한다
 * (검증 불가 ≠ 검증 실패 — 정합성과 커버리지의 트레이드).
 */
export async function findVerifiedImageUrl(
  candidates: readonly NaverCandidate[],
  verifyText: string,
): Promise<string | null> {
  const tries = candidates.slice(0, VERIFY_MAX_CANDIDATES);
  for (const c of tries) {
    if (!c.pageUrl) {
      // pageUrl을 못 잡은 결과는 검증 못 함 — 일단 채택 (네이버 단방향 fallback에서 옴).
      return c.imageUrl;
    }
    const ok = await verifyPageContainsText(c.pageUrl, verifyText);
    if (ok) return c.imageUrl;
  }
  return null;
}
