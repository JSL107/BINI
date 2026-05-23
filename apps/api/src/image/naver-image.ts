/**
 * 네이버 이미지 검색결과 HTML에서 첫 결과 이미지 URL을 추출한다.
 * 결과 이미지는 <img> 태그가 아니라 임베드 JSON의 "originalUrl" 필드에 들어있다.
 *
 * 필터:
 *   1) HTTPS만 — `http://` URL은 (1) 브라우저가 mixed-content로 차단하고
 *      (2) blogfiles.naver.net 등 자체 호스트는 https도 지원하므로 EUC-KR
 *      인코딩 파일명 가진 오래된 http 결과를 의도적으로 건너뛴다.
 *   2) 신뢰도 낮은 커뮤니티 도메인 차단 — playwares/ruliweb 등 게임 커뮤니티
 *      첨부 이미지는 검색어와 무관한 다른 게임 스크린샷이 첨부되는 경우가
 *      많아, "Project ES 게임" 같은 쿼리에 던파 이미지 등이 섞여 들어온다.
 *      이런 케이스를 컷.
 */

const COMMUNITY_BLOCKLIST = [
  // 게임 토론 커뮤니티 — 본 검색어와 무관한 첨부가 흔함
  'playwares.com',
  'bbs.ruliweb.com',
  'inven.co.kr',
  'fmkorea.com',
  'm.dcinside.com',
  // 카페·블로그도 마찬가지로 노이즈가 잦음. 단, blogfiles.naver.net 자체는
  // 결과 품질이 들쭉날쭉이라 통째 차단하지 않고 그대로 둔다 (https인 한 사용).
];

function isBlockedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return COMMUNITY_BLOCKLIST.some((b) => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

export function parseFirstImageUrl(html: string): string | null {
  const re = /"originalUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let url: string;
    try {
      url = JSON.parse(`"${m[1]}"`) as string;
    } catch {
      continue;
    }
    if (!url.startsWith('https://')) continue;
    if (isBlockedDomain(url)) continue;
    return url;
  }
  return null;
}
