/**
 * 축 A — 채용 대상 자체가 아닌 공고를 제목으로 판정해 버린다.
 *
 * 아트 안에서의 직군 차이(원화 vs 모델링 vs 애니메이션)는 여기서 다루지 않는다.
 * 그건 축 B(jobFamilies 태그)의 몫이다 — 3D 모델러는 버리지 않고 태그로 구분한다.
 *
 * 직군 라벨이 아트 계열이어도 면제하지 않는다. 2026-09-15 실측에서 웹툰 작가 공고가
 * `원화` 직군을 달고 있었다.
 *
 * 규칙이 과하면 정탐을 죽인다. 어느 규칙이 얼마나 걸렀는지 countExclusions 로 세어
 * cron 로그에 남긴다 — 특정 규칙이 갑자기 많이 거르기 시작하면 그게 신호다.
 */

export type ExclusionRule =
  | '교육·강사'
  | '웹툰·출판'
  | '비아트 직군'
  | '아트 밖 디자인';

export const EXCLUSION_RULES: readonly ExclusionRule[] = [
  '교육·강사',
  '웹툰·출판',
  '비아트 직군',
  '아트 밖 디자인',
];

/**
 * 단서는 2026-09-15 실측에서 관측한 것과, 같은 계열이라 넣은 것이 섞여 있다.
 * 관측: 강사·아카데미·학원·교육생·양성과정·국비 / 웹툰·인스타툰·만화 /
 *       프로그래머·기획·시나리오·마케팅·사업PM·GM / 아이콘·가방·액세서리·상세페이지
 * 추론: 튜터·멘토 / 출판·표지 / QA / 배너·쇼핑몰·패키지
 */
const RULE_PATTERNS: ReadonlyArray<{ rule: ExclusionRule; pattern: RegExp }> = [
  {
    rule: '교육·강사',
    pattern: /강사|아카데미|학원|교육생|양성과정|국비|튜터|멘토/u,
  },
  {
    rule: '웹툰·출판',
    pattern: /웹툰|인스타툰|만화|출판|표지/u,
  },
  {
    rule: '비아트 직군',
    // '기획'은 '기획자'·'기획 모집'처럼 직군을 가리킬 때만 잡는다. '신규 프로젝트 기획전'
    // 같은 표현까지 걸면 과잉이라 뒤에 오는 글자를 함께 본다.
    pattern:
      /프로그래머|기획자|기획\s*모집|시나리오|마케팅|사업\s*PM|GM\(게임운영\)|게임운영|\bQA\b/iu,
  },
  {
    rule: '아트 밖 디자인',
    pattern: /아이콘|배너|상세\s*페이지|쇼핑몰|가방|액세서리|패키지/u,
  },
];

/** 버려야 하면 규칙명을, 아니면 null 을 준다. 먼저 걸린 규칙이 이긴다. */
export function classifyExclusion(title: string): ExclusionRule | null {
  if (!title) return null;
  for (const { rule, pattern } of RULE_PATTERNS) {
    if (pattern.test(title)) return rule;
  }
  return null;
}

/** 규칙군별 제외 건수. 걸리지 않은 규칙도 0 으로 남겨 로그에서 자리를 지킨다. */
export function countExclusions(
  titles: string[],
): Record<ExclusionRule, number> {
  const counts = Object.fromEntries(
    EXCLUSION_RULES.map((rule) => [rule, 0]),
  ) as Record<ExclusionRule, number>;
  for (const title of titles) {
    const rule = classifyExclusion(title);
    if (rule) counts[rule] += 1;
  }
  return counts;
}
