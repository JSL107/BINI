/**
 * 검색 동의어 확장 — 사용자가 "원화"만 입력해도 "일러스트"/"컨셉아트" 공고도 잡히도록
 * 쿼리 시점에 OR 확장한다. 게임 원화 직군 도메인에 한정한 보수적 사전(hardcoded).
 *
 * 정책:
 *   - 단일 토큰 검색만 확장. 공백 포함 다중 토큰은 그대로 둔다(false-positive 회피).
 *   - 매칭은 trim + lowercase 비교. 한 토큰이 두 그룹에 속하면 둘 다 합집합.
 *   - 알려지지 않은 토큰은 입력 한 개만 반환(폴백).
 *
 * 어떤 동의어를 넣을지 결정 기준:
 *   - "이 단어 검색하면 같은 결과를 보고 싶다"는 user intent가 강한 짝만 묶는다.
 *   - 영문/한글 혼용은 양방향 확장이 필요할 때만 추가.
 *   - "art" 같은 너무 일반적인 영단어는 false-positive(scrum master, artificial) 위험으로 제외.
 */

/**
 * 같은 그룹 안의 단어들은 모두 서로의 동의어. 그룹 간에는 독립.
 * 모든 항목은 lowercase로 작성한다 (입력은 비교 시 lowercase로 정규화됨).
 */
const SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  // 게임 원화/일러스트 직군
  ['원화', '일러스트', '일러스트레이터', '컨셉아트', '컨셉 아트', 'concept art'],
  // 배경
  ['배경', '배경원화', 'background'],
  // 캐릭터
  ['캐릭터', '캐릭터원화', 'character'],
  // 3D
  ['3d', '쓰리디'],
  // 2D
  ['2d', '이디'],
  // UI/UX
  ['ui', '유아이', 'ux', '유엑스'],
  // 애니메이션 / 모션
  ['애니메이터', '애니메이션', 'animator', 'animation'],
  // 게임기획
  ['기획', '게임기획', '게임 기획', 'planner', 'game planner'],
];

/** 입력 토큰이 속한 모든 그룹의 합집합을 반환. 속한 그룹이 없으면 빈 배열. */
function lookupSynonyms(token: string): string[] {
  const t = token.toLowerCase().trim();
  if (!t) return [];
  const set = new Set<string>();
  for (const group of SYNONYM_GROUPS) {
    if (group.some((g) => g.toLowerCase() === t)) {
      for (const term of group) set.add(term);
    }
  }
  return Array.from(set);
}

/**
 * 검색어를 동의어 확장한 후보 리스트로 변환.
 * - 입력이 비어 있으면 빈 배열(필터 미적용 의미).
 * - 단일 토큰이 사전에 있으면 해당 그룹 합집합(자기 자신 포함).
 * - 그 외(다중 토큰 / 미사전 토큰)는 입력 한 개만 반환.
 *
 * 반환은 항상 dedup된 lowercase 문자열 배열. 호출자(쿼리 빌더)가 ILIKE에 사용한다.
 */
export function expandSearchTerms(raw: string): string[] {
  const q = (raw ?? '').trim();
  if (!q) return [];
  // 공백 포함 시 다중 토큰으로 간주 — 확장하지 않는다.
  if (/\s/.test(q)) return [q];
  const expanded = lookupSynonyms(q);
  if (expanded.length === 0) return [q];
  // 확장 시에도 입력 원형은 항상 포함(대소문자 보존 차원에서 정규화 차이 흡수).
  const lowered = q.toLowerCase();
  const dedup = new Set<string>([lowered, ...expanded]);
  return Array.from(dedup);
}
