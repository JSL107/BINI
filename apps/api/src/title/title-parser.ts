import type { ImageQueryType } from '@bini/types';

export interface TitleParseResult {
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
}

// 게임명이 아닌, 회사명 대체 검색으로 보내야 하는 키워드
const GENERIC_TERMS = ['신규 프로젝트', '신규프로젝트', '프로젝트', '차기작', '신작', '미정'];
const GENRE_TERMS = ['mmorpg', 'rpg', 'fps', 'tps', 'aos', 'moba', 'rts', 'ccg',
  '캐주얼', '방치형', '서브컬처', '수집형', '시뮬레이션', '퍼즐', '디펜스', '액션', '소셜카지노'];
const PLATFORM_REGION_EMPLOYMENT = ['모바일', 'pc', '콘솔', 'vr', 'ar', '웹',
  '서울', '부산', '경기', '인천', '대구', '대전', '광주', '울산', '경북', '경남', '판교', '성남',
  '인턴', '정규직', '계약직', '신입', '경력', '신입/경력', '병역특례'];
const ORG_SUFFIXES = ['스튜디오', '게임센터', '게임즈', '소프트', '컴퍼니', '엔터테인먼트',
  '주식회사', '코퍼레이션', 'studio', 'games', 'soft'];

function isNonGame(bracket: string): boolean {
  const t = bracket.trim().toLowerCase();
  if (t.length === 0) return true;
  if (GENERIC_TERMS.some((w) => t === w.toLowerCase())) return true;
  if (GENRE_TERMS.some((w) => t.includes(w))) return true;
  if (PLATFORM_REGION_EMPLOYMENT.some((w) => t === w.toLowerCase())) return true;
  if (ORG_SUFFIXES.some((w) => t.endsWith(w))) return true;
  if (t.includes('/')) return true; // "부산/인턴" 같은 복합 태그
  return false;
}

/** 제목 맨 앞의 첫 대괄호 내용을 추출한다. 없으면 null. */
export function extractFirstBracket(title: string): string | null {
  const m = title.trimStart().match(/^\[([^\]]*)\]/);
  return m ? m[1].trim() : null;
}

export function parseTitle(title: string, company: string): TitleParseResult {
  const bracket = extractFirstBracket(title);
  if (bracket === null || isNonGame(bracket)) {
    return { gameTitle: null, imageQuery: company.trim(), imageQueryType: 'company' };
  }
  return {
    gameTitle: bracket,
    imageQuery: `${bracket} 게임`,
    imageQueryType: 'game',
  };
}
