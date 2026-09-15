import * as cheerio from 'cheerio';
import type { RawJob } from './raw-job';
import { ART_KEYWORD_REGEX } from './wanted-parser';

const BASE = 'https://www.jobkorea.co.kr';

function absoluteUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return BASE + href;
}

/**
 * 잡코리아 "게임 원화" 검색결과 HTML에서 CardJob들을 RawJob 배열로 추출한다.
 * 검색 결과는 "관련성" 정렬이라 비-아트 직군도 섞여 있어
 * client-side ART_KEYWORD_REGEX(Wanted와 공유)로 추가 필터링한다.
 */
export function parseJobkoreaList(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $('div[data-sentry-component="CardJob"]').each((_, el) => {
    const card = $(el);

    // 첫 a (CompanyLogo)의 href에서 sourceId 추출
    const logoAnchor = card
      .find('a[data-sentry-component="CompanyLogo"]')
      .first();
    const detailHref = logoAnchor.attr('href') ?? '';
    const idMatch = detailHref.match(/GI_Read\/(\d+)/);
    if (!idMatch) return;
    const sourceId = idMatch[1];
    const detailUrl = absoluteUrl(detailHref);

    // 제목 (Title 컴포넌트 안의 첫 span)
    const titleAnchor = card.find('a[data-sentry-component="Title"]').first();
    const title = titleAnchor.find('span').first().text().trim();
    if (!title) return;

    // 회사명: Title 다음의 mb-5 span 안의 truncate span
    // 안전한 셀렉터: card 안의 모든 a 중에서 Title이 아닌 첫 anchor의 첫 truncate span
    let company = '';
    card.find('a').each((_, a) => {
      if (company) return;
      const $a = $(a);
      if ($a.attr('data-sentry-component') === 'Title') return;
      if ($a.attr('data-sentry-component') === 'CompanyLogo') return;
      const span = $a.find('span.truncate').first();
      const text = span.text().trim();
      if (text) {
        company = text;
      }
    });
    if (!company) return;

    // 태그: GrayChip 안의 텍스트 (location/career/job type)
    const tags: string[] = [];
    card.find('div[data-sentry-component="GrayChip"]').each((_, chip) => {
      const text = $(chip).text().trim().replace(/\s+/g, ' ');
      if (text) tags.push(text);
    });

    jobs.push({
      source: 'jobkorea',
      sourceId,
      company,
      // 잡코리아 카드 내에서는 회사 상세 페이지 링크가 별도로 표시되지 않음
      companyUrl: '',
      title,
      detailUrl,
      // 잡코리아 검색 카드는 마감일을 직접 노출하지 않음 (상시로 간주)
      deadline: '상시',
      // 등록일 텍스트도 없음 — 빈 문자열로 두면 parseRelativeTime이 now 반환
      registeredAtText: '',
      tags,
      // 이 소스는 목록에 직군 라벨을 주지 않는다. 게임잡만 채운다.
      jobFamilies: [],
    });
  });

  // 아트 키워드로 필터링
  return jobs.filter((j) => ART_KEYWORD_REGEX.test(j.title));
}

/** 페이지네이션 anchors에서 최대 Page_No 추출. */
export function parseJobkoreaTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $('div[data-sentry-component="Pagination"] a').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/Page_No=(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return max;
}
