import * as cheerio from 'cheerio';
import type { RawJob } from './raw-job';

const BASE = 'https://www.saramin.co.kr';

function absoluteUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  return BASE + href;
}

/**
 * 사람인 "게임 원화" 검색결과 HTML에서 item_recruit 카드를 RawJob 배열로 추출한다.
 * 사람인 검색은 "원화" 카테고리 매칭이라 결과가 이미 art-relevant — 추가 키워드 필터링 안 함.
 */
export function parseSaraminList(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $('div.item_recruit').each((_, el) => {
    const card = $(el);
    const sourceId = card.attr('value') ?? '';
    if (!sourceId) return;

    const titleAnchor = card.find('h2.job_tit a').first();
    const detailHref = titleAnchor.attr('href') ?? '';
    const detailUrl = absoluteUrl(detailHref);
    // 제목은 anchor 안의 span 또는 anchor 자체 텍스트. title 속성도 동일하지만 span 우선.
    const titleSpan = titleAnchor.find('span').first();
    const title = (titleSpan.text() || titleAnchor.attr('title') || '').trim();
    if (!title) return;

    const companyAnchor = card.find('div.area_corp strong.corp_name a').first();
    const company = companyAnchor.text().trim();
    const companyUrl = absoluteUrl(companyAnchor.attr('href') ?? '');
    if (!company) return;

    const deadline = card.find('div.job_date span.date').first().text().trim() || '상시';
    const registeredAtText = card.find('span.job_day').first().text().trim();

    // 태그: job_condition span들 + job_sector 카테고리 (회사 카테고리 1-2개만)
    const tags: string[] = [];
    card.find('div.job_condition span').each((_, sp) => {
      const text = $(sp).text().trim().replace(/\s+/g, ' ');
      if (text) tags.push(text);
    });

    jobs.push({
      source: 'saramin',
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

/**
 * 사람인 페이지네이션 — recruitPage 파라미터 기반.
 * 픽스처에는 26건 = 1페이지에 모두 들어가는 경우 명시적 페이지 링크 없음.
 * 더 일반화: pagination 링크 중 최대 recruitPage 값을 추출. 없으면 1.
 */
export function parseSaraminTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $('a').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/recruitPage=(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return max;
}
