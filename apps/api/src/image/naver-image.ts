/**
 * 네이버 이미지 검색결과 HTML에서 첫 결과 이미지 URL을 추출한다.
 * 결과 이미지는 <img> 태그가 아니라 임베드 JSON의 "originalUrl" 필드에 들어있다.
 * 캡처한 JSON 문자열 값은 JSON.parse로 디코드해 모든 이스케이프(& 등)를 복원한다.
 * 없거나 http(s)로 시작하지 않으면 null.
 */
export function parseFirstImageUrl(html: string): string | null {
  const m = html.match(/"originalUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  let url: string;
  try {
    url = JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
  return url.startsWith('http') ? url : null;
}
