import * as cheerio from 'cheerio';

export interface RawJob {
  id: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAtText: string;
  tags: string[];
}

const BASE_URL = 'https://www.gamejob.co.kr';

function makeAbsolute(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return BASE_URL + href;
}

/**
 * Extracts the full (untruncated) title from the onclick attribute of the job link.
 * Format: GA_Application_Prdt('02_공고클릭', 'N', '<FULL TITLE>', '<GI_No>', ...)
 * Falls back to the <strong> text if onclick is not present or unparseable.
 */
function extractFullTitle(onclick: string, fallback: string): string {
  if (!onclick) return fallback;
  // Match the 3rd string argument (after '02_공고클릭', 'N', '<title>')
  // The pattern accounts for single-quoted arguments
  const match = onclick.match(
    /GA_Application_Prdt\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'((?:[^'\\]|\\.)*)'/,
  );
  if (match && match[1]) {
    return match[1];
  }
  return fallback;
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
    const id = idMatch ? idMatch[1] : '';

    const strongText = detailAnchor.find('strong').text().trim();
    const onclick = detailAnchor.attr('onclick') ?? '';
    const title = extractFullTitle(onclick, strongText);

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
      id,
      company,
      companyUrl,
      title,
      detailUrl,
      deadline,
      registeredAtText,
      tags,
    });
  });

  return jobs;
}

export function parseTotalPages(html: string): number {
  const $ = cheerio.load(html);
  const text = $('.totalJobcnt').text().trim();
  // text looks like "(266)"
  const match = text.match(/\((\d+)\)/);
  if (!match) return 1;
  const count = parseInt(match[1], 10);
  return Math.ceil(count / 40);
}
