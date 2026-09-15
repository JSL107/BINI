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
 * 모든 패턴은 2026-09-15 실측(duty=5)에서 실제로 관측한 제목에서만 뽑았다.
 * 관측: 강사·아카데미·학원·교육생·양성과정·국비 / 웹툰·인스타툰 /
 *       프로그래머·기획자·기획 모집·시나리오·사업PM·GM(게임운영)·게임운영 /
 *       아이콘·가방·액세서리·상세페이지
 *
 * 초기 구현에는 "같은 계열이니 걸러도 되겠지"라는 추론으로 넣은 패턴(튜터·멘토·출판·표지·
 * QA·배너·쇼핑몰·패키지·만화·마케팅)이 섞여 있었다. 리뷰에서 이 패턴들이 실제 게임 아트
 * 공고를 오탐으로 버리는 것이 재현됐다 — 예: "인게임 이벤트 배너 일러스트레이터 모집",
 * "패키지 일러스트레이터 모집", "웹툰풍 게임 원화가 모집", "카툰/만화체 캐릭터 원화가",
 * "사수 멘토링 프로그램 운영", "마케팅 아트 디자이너". 병합 전 전부 제거했다.
 */
const RULE_PATTERNS: ReadonlyArray<{ rule: ExclusionRule; pattern: RegExp }> = [
  {
    rule: '교육·강사',
    pattern: /강사|아카데미|학원|교육생|양성과정|국비/u,
  },
  {
    rule: '웹툰·출판',
    // '웹툰'은 채용 대상 자체(웹툰 작가)를 가리킬 때만 잡는다. '웹툰풍'·'웹툰체'·'웹툰 원작'·
    // '웹툰 기반'·'웹툰 IP'처럼 원화 공고의 스타일·IP 설명으로 쓰이면 걸지 않는다.
    pattern: /웹툰(?!풍|체|\s*(?:원작|기반|IP))|인스타툰/iu,
  },
  {
    rule: '비아트 직군',
    // '기획'은 '기획자'·'기획 모집'처럼 직군을 가리킬 때만 잡는다. '신규 프로젝트 기획전'
    // 같은 표현까지 걸면 과잉이라 뒤에 오는 글자를 함께 본다.
    pattern:
      /프로그래머|기획자|기획\s*모집|시나리오|사업\s*PM|GM\(게임운영\)|게임운영/iu,
  },
  {
    rule: '아트 밖 디자인',
    pattern: /아이콘|상세\s*페이지|가방|액세서리/u,
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
