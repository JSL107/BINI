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
      if (COMPANY_HEADERS.some((h) => headerText.includes(h))) category = 'company';
      else if (JOBBOARD_HEADERS.some((h) => headerText.includes(h))) category = 'jobBoard';
      else if (INFO_HEADERS.some((h) => headerText.includes(h))) category = 'companyInfo';
      else category = null; // 다른 헤더(Contributor 등)는 분류 끊기
      continue;
    }

    if (category === null) continue;

    const m = raw.match(LINK_LINE);
    if (!m) continue;
    const name = m[1].trim();
    const url = m[2].trim();
    if (!name || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    sites.push({ name, url, category });
  }

  return sites;
}
