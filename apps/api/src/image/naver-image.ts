/**
 * 네이버 이미지 검색결과 HTML에서 첫 결과 이미지 URL을 추출한다.
 * 결과 이미지는 <img> 태그가 아니라 임베드 JSON의 "originalUrl" 필드에 들어있다.
 * 없으면 null.
 */
export function parseFirstImageUrl(html: string): string | null {
  const m = html.match(/"originalUrl":"([^"]+)"/);
  if (!m) return null;
  const url = m[1].replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
  return url.startsWith('http') ? url : null;
}
