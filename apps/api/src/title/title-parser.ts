import type { ImageQueryType } from '@bini/types';

export interface TitleParseResult {
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
}

// 게임명이 아닌, 회사명 대체 검색으로 보내야 하는 키워드. 모든 항목은 소문자 — t는 비교 전 소문자화된다.
const GENERIC_TERMS = ['신규 프로젝트', '신규프로젝트', '프로젝트', '차기작', '신작', '미정'];
const GENRE_TERMS = ['mmorpg', 'rpg', 'fps', 'tps', 'aos', 'moba', 'rts', 'ccg',
  '캐주얼', '방치형', '서브컬처', '수집형', '시뮬레이션', '퍼즐', '디펜스', '액션', '소셜카지노'];
const PLATFORM_REGION_EMPLOYMENT = ['모바일', 'pc', '콘솔', 'vr', 'ar', '웹',
  '서울', '부산', '경기', '인천', '대구', '대전', '광주', '울산', '경북', '경남', '판교', '성남',
  '인턴', '정규직', '계약직', '신입', '경력', '병역특례'];
// 한글 조직 접미사 — 도메인 특화·충분히 길어 endsWith로 검사
const ORG_SUFFIXES = ['스튜디오', '게임센터', '게임즈', '소프트', '컴퍼니', '엔터테인먼트',
  '주식회사', '코퍼레이션'];
// 영문 조직 단어 — 짧고 일반 어휘라 endsWith는 게임명을 오탐('Herosoft' 등) → 정확 매칭만
const ORG_EXACT = ['studio', 'games', 'soft'];

function isNonGame(bracket: string): boolean {
  const t = bracket.trim().toLowerCase();
  if (t.length === 0) return true;
  if (t.includes('/')) return true; // "부산/인턴" 같은 복합 태그
  if (GENERIC_TERMS.some((w) => t === w.toLowerCase())) return true;
  // 정확 매칭 — 'rpg'/'aos' 등 짧은 코드가 'Chaos' 같은 게임명을 substring 오탐하지 않도록
  if (GENRE_TERMS.some((w) => t === w)) return true;
  // 정확 매칭 — '모바일'이 '던파모바일2D'를 오탐하지 않도록
  if (PLATFORM_REGION_EMPLOYMENT.some((w) => t === w.toLowerCase())) return true;
  if (ORG_SUFFIXES.some((w) => t.endsWith(w))) return true;
  if (ORG_EXACT.some((w) => t === w)) return true;
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
