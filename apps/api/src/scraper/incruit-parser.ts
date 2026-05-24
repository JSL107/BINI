import * as cheerio from 'cheerio';
import type { RawJob } from './raw-job';

/**
 * 인크루트 원화·일러스트 카테고리(cd=12690) 검색 결과를 RawJob[]로 추출한다.
 * 픽스처는 EUC-KR을 UTF-8로 변환한 상태이므로 cheerio.load가 그대로 처리한다.
 * (런타임 fetch는 incruit-scraper.service.ts에서 EUC-KR→UTF-8 디코딩 후 호출.)
 */
export function parseIncruitList(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $('ul.c_row[jobno]').each((_, el) => {
    const row = $(el);
    const sourceId = row.attr('jobno') ?? '';
    if (!sourceId) return;

    const companyAnchor = row.find('.cell_first .cl_top a.cpname').first();
    const company = companyAnchor.text().trim();
    const companyUrl = companyAnchor.attr('href') ?? '';
    if (!company) return;

    const titleAnchor = row.find('.cell_mid .cl_top a[href*="jobdb_info"]').first();
    const title = titleAnchor.text().trim();
    const detailUrl = titleAnchor.attr('href') ?? '';
    if (!title || !detailUrl) return;

    const tags: string[] = [];
    row.find('.cell_mid .cl_md span').each((_, sp) => {
      const text = $(sp).text().trim().replace(/\s+/g, ' ');
      if (text) tags.push(text);
    });

    const deadlineSpan = row.find('.cell_last .cl_btm span').first();
    const deadline = deadlineSpan.text().trim() || '상시';
    const registeredAtText = row.find('.cell_last .cl_btm span').eq(1).text().trim();

    jobs.push({
      source: 'incruit',
      sourceId,
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

export function parseIncruitTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $('a').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/[?&]PageNo=(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return max;
}
