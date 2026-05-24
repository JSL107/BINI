import type { Job } from '@bini/types';

/**
 * 게임 아트 채용에서 자주 보이는 작업 카테고리. 사용자가 자기 포트폴리오에
 * 보유한 카테고리를 체크하고, 잡의 title+tags에서 추출한 카테고리와 매칭해
 * 매칭률·미보유 카테고리를 시각화하는 데 쓴다.
 *
 * 카테고리 라벨은 한국어로 노출하되 키는 영문 enum으로 안정화 — localStorage
 * 직렬화 깨짐 방지.
 */
export type PortfolioCategory =
  | 'character'
  | 'background'
  | 'ui'
  | 'concept'
  | 'illustration'
  | 'modeling3d'
  | 'effect'
  | 'animation';

export const PORTFOLIO_CATEGORIES: ReadonlyArray<PortfolioCategory> = [
  'character',
  'background',
  'ui',
  'concept',
  'illustration',
  'modeling3d',
  'effect',
  'animation',
];

export const CATEGORY_LABEL: Record<PortfolioCategory, string> = {
  character: '캐릭터',
  background: '배경',
  ui: 'UI',
  concept: '컨셉아트',
  illustration: '일러스트',
  modeling3d: '3D 모델',
  effect: '이펙트',
  animation: '애니메이션',
};

/**
 * 각 카테고리의 매칭 키워드 — title + tags 합쳐서 case-insensitive 부분 매칭.
 * 한국어 + 자주 보는 영문 약자 모두 포함. 한 잡이 여러 카테고리에 동시 매칭
 * 될 수 있다 (예: "3D 캐릭터 모델러").
 */
// "환경/등장인물/3d/fx" 단독 매칭은 false positive 위험이 커서 제외:
//   - 환경 → "근무 환경", "개발 환경" 같은 복지 문구와 충돌
//   - 등장인물 → 시나리오/스토리 직군과 충돌
//   - 3d 단독 → "3D 환경 디자이너", "3D UI" 같이 다른 직군에도 매칭 → 모든 카드에
//     modeling3d가 required로 끼어드는 노이즈. "3d 모델/모델러/asset" 같이 명확한
//     모델링 어휘만 허용.
//   - fx 단독 → "MaxFx" 같은 합성어 충돌. vfx + 이펙트로 충분 커버.
const CATEGORY_KEYWORDS: Record<PortfolioCategory, RegExp[]> = {
  character: [/캐릭터/, /character/i, /몬스터/],
  background: [/배경/, /background/i, /environment/i, /맵\s*아트/, /map\s*art/i],
  ui: [/\bui\b/i, /\bgui\b/i, /유저\s*인터페이스/, /인터페이스/, /\bux\b/i],
  concept: [/컨셉/, /concept/i, /시안/, /원화/],
  illustration: [/일러스트/, /illustration/i, /원화가/, /삽화/],
  modeling3d: [
    /3d\s*모델/i,
    /3d\s*(?:asset|애셋|에셋)/i,
    /모델러/,
    /modeler/i,
    /modeling/i,
    /모델링/,
  ],
  effect: [/이펙트/, /effect/i, /\bvfx\b/i, /\bfx\b/i, /비주얼\s*이펙트/],
  animation: [/애니메이션/, /animation/i, /애니메이터/, /animator/i, /리깅/, /rigging/i, /모션/, /motion/i],
};

/**
 * 잡 한 건이 요구하는 카테고리들. title + tags + gameTitle 합친 텍스트를
 * 각 카테고리 키워드와 매칭. 매칭된 카테고리들의 Set 반환.
 */
export function categorizeJob(job: Pick<Job, 'title' | 'tags' | 'gameTitle'>): Set<PortfolioCategory> {
  const haystack =
    `${job.title} ${job.tags.join(' ')} ${job.gameTitle ?? ''}`.trim();
  const out = new Set<PortfolioCategory>();
  for (const cat of PORTFOLIO_CATEGORIES) {
    for (const pattern of CATEGORY_KEYWORDS[cat]) {
      if (pattern.test(haystack)) {
        out.add(cat);
        break;
      }
    }
  }
  return out;
}

/**
 * 사용자 보유 카테고리 vs 잡 요구 카테고리 매칭 결과.
 * - matched: 둘 다에 있는 카테고리
 * - missing: 잡이 요구하지만 사용자가 안 가진 카테고리
 * - score: matched.size / required.size (요구 카테고리 없으면 1.0)
 */
export interface CategoryMatch {
  required: PortfolioCategory[];
  matched: PortfolioCategory[];
  missing: PortfolioCategory[];
  score: number;
}

export function matchJobToOwned(
  job: Pick<Job, 'title' | 'tags' | 'gameTitle'>,
  owned: ReadonlySet<PortfolioCategory>,
): CategoryMatch {
  const required = [...categorizeJob(job)];
  const matched = required.filter((c) => owned.has(c));
  const missing = required.filter((c) => !owned.has(c));
  const score = required.length === 0 ? 1 : matched.length / required.length;
  return { required, matched, missing, score };
}

const STORAGE_KEY = 'bini:portfolio:owned-v1';

/**
 * 같은 탭 안에서 owned 카테고리 변경을 다른 컴포넌트가 즉시 알 수 있도록
 * 발행하는 커스텀 이벤트 이름. 브라우저의 'storage' 이벤트는 명세상 다른 탭에서만
 * 발화되므로 SPA 안의 PortfolioChecklist → JobCard PortfolioMatchBadge 갱신 경로엔
 * 부족하다. saveOwnedCategories가 항상 이 이벤트도 함께 발행한다.
 */
export const PORTFOLIO_CHANGE_EVENT = 'bini:portfolio-changed';

/**
 * SSR-safe localStorage 로드. window 없으면 빈 Set 반환.
 * 잘못된 JSON / 유효하지 않은 키 자동 무시.
 */
export function loadOwnedCategories(): Set<PortfolioCategory> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const valid = new Set<PortfolioCategory>();
    for (const v of parsed) {
      if (typeof v === 'string' && (PORTFOLIO_CATEGORIES as readonly string[]).includes(v)) {
        valid.add(v as PortfolioCategory);
      }
    }
    return valid;
  } catch {
    return new Set();
  }
}

export function saveOwnedCategories(owned: ReadonlySet<PortfolioCategory>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
  } catch {
    // 저장 실패(스토리지 풀, private mode)는 무시 — 다음 토글 때 재시도.
  }
  // localStorage 쓰기 실패와 무관하게 같은 탭의 다른 컴포넌트엔 변경을 알린다.
  // 'storage' 이벤트는 다른 탭에서만 발화하므로 같은 탭은 별도 이벤트가 필요하다.
  try {
    window.dispatchEvent(new CustomEvent(PORTFOLIO_CHANGE_EVENT));
  } catch {
    // CustomEvent 미지원 환경(매우 오래된 브라우저)은 무시.
  }
}
