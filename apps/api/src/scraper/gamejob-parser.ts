import * as cheerio from 'cheerio';
import type { RawJob } from './raw-job';

const BASE_URL = 'https://www.gamejob.co.kr';

function makeAbsolute(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return BASE_URL + href;
}

/**
 * Extracts the title from the onclick GA_Application_Prdt 3rd argument.
 * Used as a fallback only when the <strong> element text is empty.
 * Format: GA_Application_Prdt('02_공고클릭', 'N', '<FULL TITLE>', '<GI_No>', ...)
 */
function extractOnclickTitle(onclick: string): string {
  if (!onclick) return '';
  // Match the 3rd string argument (after '02_공고클릭', 'N', '<title>')
  // The pattern accounts for single-quoted arguments
  const match = onclick.match(
    /GA_Application_Prdt\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'((?:[^'\\]|\\.)*)'/,
  );
  if (match && match[1]) {
    return match[1];
  }
  return '';
}

/**
 * onclick 의 GA_Application_Prdt 호출에서 직군 라벨 목록을 뽑는다.
 *
 * IsNullOrWhiteSpace(...) 인자는 출현 순서대로 직군 · 장르 · 지역이다.
 * 위치 인자(6번째 등)는 '없음' / 'Sword 채용관' 처럼 값이 달라져 쉼표로 세면 어긋나므로,
 * IsNullOrWhiteSpace 출현 순서만 신뢰한다.
 */
function extractOnclickJobFamilies(onclick: string): string[] {
  if (!onclick) return [];
  const match = onclick.match(/IsNullOrWhiteSpace\('([^']*)'\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseJobList(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $('table.tblList > tbody > tr').each((_i, row) => {
    const $row = $(row);

    // Skip rows that have no job detail link
    const detailAnchor = $row.find(
      'td:nth-child(2) div.tit a[href*="/Recruit/GI_Read/View?GI_No="]',
    );
    if (detailAnchor.length === 0) return;

    // Company
    const companyAnchor = $row.find(
      'td:nth-child(1) div.company a[href^="/Company/Detail"]',
    );
    const company = companyAnchor.find('strong').text().trim();
    const companyUrl = makeAbsolute(companyAnchor.attr('href') ?? '');

    // Title, detailUrl, id
    const detailHref = detailAnchor.attr('href') ?? '';
    const detailUrl = makeAbsolute(detailHref);
    const idMatch = detailHref.match(/GI_No=(\d+)/);
    if (!idMatch) return; // Fix 2: skip rows with no numeric GI_No
    const id = idMatch[1];

    const strongText = detailAnchor.find('strong').text().trim();
    const onclick = detailAnchor.attr('onclick') ?? '';
    const jobFamilies = extractOnclickJobFamilies(onclick);
    // Fix 1: <strong> text is primary; onclick GA_Application_Prdt 3rd arg is fallback
    const title = strongText || extractOnclickTitle(onclick);

    // Deadline and registeredAtText
    const deadline = $row.find('td:nth-child(3) span.date').text().trim();
    const registeredAtText = $row
      .find('td:nth-child(3) span.modifyDate')
      .text()
      .trim();

    // Tags
    const tags: string[] = [];
    $row.find('td:nth-child(2) p.info span').each((_j, span) => {
      const text = $(span).text().trim();
      if (text) tags.push(text);
    });

    jobs.push({
      source: 'gamejob',
      sourceId: id,
      company,
      companyUrl,
      title,
      detailUrl,
      deadline,
      registeredAtText,
      tags,
      jobFamilies,
    });
  });

  return jobs;
}

export function parseTotalPages(html: string): number {
  const $ = cheerio.load(html);
  const text = $('.totalJobcnt').text().trim();
  // text looks like "(266)" or "(1,266)"
  const match = text.match(/\(([0-9,]+)\)/);
  if (!match) return 1;
  // Fix 3: strip commas and non-digit chars before parsing
  const count = parseInt(match[1].replace(/[^\d]/g, ''), 10);
  return Math.ceil(count / 40);
}
