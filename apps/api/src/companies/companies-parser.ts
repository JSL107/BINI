import type { CareerSiteLink, CareerSiteCategory } from '@bini/types';

/**
 * GameForPeople/korea-game-career-site README.md를 파싱해서
 * 회사 채용 페이지 / 관련 채용 사이트 / 기업 정보 사이트로 분류한다.
 *
 * 마크다운 구조 (2026-05-23 시점):
 *   ## 📋 자체 채용 사이트 링크
 *   * [name](url)
 *   ...
 *   ## 🌈 관련 사이트
 *   > ### 채용 관련 사이트
 *   >* [name](url)
 *   > ### 기업 정보 관련 사이트
 *   >* [name](url)
 */
export function parseCareerSitesMarkdown(md: string): CareerSiteLink[] {
  if (!md) return [];

  const sites: CareerSiteLink[] = [];
  const lines = md.split(/\r?\n/);
  let category: CareerSiteCategory | null = null;

  // 카테고리 헤더 매칭 (## 또는 > ### 둘 다)
  const COMPANY_HEADERS = ['자체 채용 사이트 링크'];
  const JOBBOARD_HEADERS = ['채용 관련 사이트'];
  const INFO_HEADERS = ['기업 정보 관련 사이트'];

  // 라인 단위 링크 추출: `* [name](url)` 또는 `>* [name](url)` 모두 허용
  const LINK_LINE = /^\s*>?\s*\*\s*\[([^\]]+)\]\(([^)]+)\)/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 헤더 감지 — ## 또는 > ### 형식
    if (/^#{2,3}\s/.test(line) || /^>\s*#{2,3}\s/.test(line)) {
      const headerText = line.replace(/^>?\s*#+\s*/, '').trim();
      if (COMPANY_HEADERS.some((h) => headerText.includes(h)))
        category = 'company';
      else if (JOBBOARD_HEADERS.some((h) => headerText.includes(h)))
        category = 'jobBoard';
      else if (INFO_HEADERS.some((h) => headerText.includes(h)))
        category = 'companyInfo';
      else category = null; // 다른 헤더(Contributor 등)는 분류 끊기
      continue;
    }

    if (category === null) continue;

    const m = raw.match(LINK_LINE);
    if (!m) continue;
    const rawName = m[1].trim();
    const url = m[2].trim();
    if (!rawName || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (isDeadSite(rawName, url)) continue;
    const name = cleanName(rawName);
    if (!name) continue;
    sites.push({ name, url, category });
  }

  return sites;
}

/**
 * 외부 README가 자주 덧붙이는 보조 텍스트 — `(보너스 지급)`, `(보 지급)` 등
 * 채용 광고성 멘트를 이름에서 제거한다. 한글/영문 괄호 모두 처리.
 */
function cleanName(name: string): string {
  return name
    .replace(/[\(（][^)）]*?(?:지급|보너스|이벤트|추천|혜택)[^)）]*[\)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 운영 종료/장기 미관리로 알려진 사이트는 표시에서 제외한다.
 * 외부 README가 갱신될 때까지의 임시 필터 — 살아난 게 확인되면 목록에서 빼면 됨.
 */
function isDeadSite(name: string, url: string): boolean {
  const lowerUrl = url.toLowerCase();
  // 프로그래머스 채용은 2024년 서비스 종료(career.programmers.co.kr 도메인 자체가 만료).
  if (/프로그래머스/.test(name)) return true;
  if (lowerUrl.includes('career.programmers')) return true;
  // 크레딧잡 — 사용자 요청으로 목록에서 제외 (이름/도메인 양쪽 모두 매칭).
  if (/크레딧잡|kreditjob|creditjob/i.test(name)) return true;
  if (/kreditjob|creditjob/i.test(lowerUrl)) return true;
  return false;
}
