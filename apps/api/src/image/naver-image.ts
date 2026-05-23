/**
 * 네이버 이미지 검색결과 HTML에서 첫 결과 이미지 URL을 추출한다.
 * 결과 이미지는 <img> 태그가 아니라 임베드 JSON의 "originalUrl" 필드에 들어있다.
 *
 * HTTPS만 채택한다 — `http://` URL은 (1) 브라우저가 mixed-content로 차단하는
 * 경우가 많고 (2) blogfiles.naver.net 같은 네이버 자체 호스트는 https도 지원하므로
 * EUC-KR 인코딩 파일명을 가진 오래된 http 결과를 의도적으로 건너뛰고
 * 첫 https 결과를 우선 사용한다. 모든 결과가 http면 null.
 */
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
    if (url.startsWith('https://')) return url;
  }
  return null;
}
