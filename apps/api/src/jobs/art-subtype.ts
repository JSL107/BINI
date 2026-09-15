/**
 * 원화 안에서 캐릭터 / 배경·컨셉을 가른다.
 *
 * 게임잡 직군 라벨은 `원화` 하나뿐이고 하위를 나눠주지 않아 제목에서 뽑는다.
 * 2026-09-15 실측(duty=5 120건)에서 제목만으로 43%가 갈렸다(캐릭터 28 · 배경·컨셉 24).
 *
 * 직군이 `원화` 인 공고에만 적용한다. 그러지 않으면 모델링 직군의 "3D 캐릭터 모델러"에
 * 캐릭터가 붙어 원화 탭에 3D 모델러가 올라온다 — 같은 실측에서 duty=6 의 캐릭터 포함
 * 공고 15건이 대부분 3D 모델러였다.
 *
 * `컨셉`/`콘셉`/`concept` 은 배경 전용 단서가 아니다 — "캐릭터 컨셉 아티스트"처럼 컨셉이
 * 캐릭터를 수식하는 제목이 실측에 44건 중 4건 있었다. 그래서 배경/environment 처럼 명시적인
 * 신호가 없을 때, 그리고 캐릭터 신호가 함께 없을 때만 컨셉을 배경 단서로 쓴다. 배경이 명시된
 * 제목("캐릭터 / 배경")은 캐릭터가 있어도 그대로 배경·컨셉을 붙인다.
 *
 * `jobFamilies.includes('원화')` 게이트만으로는 부족하다 — 게임잡 포스터는 한 공고에 여러
 * 직군을 동시에 단다. 2026-09-15 실측(gamejob-wonhwa-list 픽스처, 채택 38건)에서 25건이
 * 2개 이상 직군을 걸었고, 9건은 원화·모델링을 함께 걸었다. 그 9건 중 5건이 게이트만으로는
 * 3D 모델러/레벨러 공고에도 캐릭터·배경·컨셉 하위 구분이 잘못 붙었다(예: "3D 배경 모델러",
 * "3D 캐릭터 제작 아티스트 모집"). `JobCard` 가 하위 구분이 있으면 직군 대신 하위 구분만
 * 보여주므로, 이 상태로는 3D 모델러가 카드에 "캐릭터" 뱃지 하나로만 보인다.
 *
 * 그래서 제목에 원화/일러스트 단서가 명시되면 그대로 신뢰하고, 그렇지 않은데 제목이 다른
 * 아트 직군(3D, 모델러, 모델링, 레벨러, 리거/리깅, 애니메이터/애니메이션, 이펙터/이펙트,
 * VFX)을 가리키면 하위 구분을 붙이지 않는다 — 포스터가 단 원화 태그는 겸업 태그지 실제
 * 역할이 아니라고 본다. `2D` 는 이 단서에 포함하지 않는다("2D 캐릭터 원화가"처럼 원화
 * 제목에도 흔히 붙기 때문).
 */

export const ART_SUBTYPE_CHARACTER = '캐릭터';
export const ART_SUBTYPE_BACKGROUND = '배경·컨셉';

const ART_FAMILY = '원화';

const CHARACTER_PATTERN = /캐릭터|character/iu;
const BACKGROUND_EXPLICIT_PATTERN = /배경|environment/iu;
const CONCEPT_PATTERN = /컨셉|콘셉|concept/iu;
const TRUST_TITLE_PATTERN = /원화|일러스트|illustration/iu;
const OTHER_DISCIPLINE_PATTERN =
  /3D|모델러|모델링|레벨러|리거|리깅|애니메이터|애니메이션|이펙터|이펙트|VFX/iu;

/** 붙일 하위 구분 목록. 배타가 아니라 둘 다 붙을 수 있다. */
export function extractArtSubtypes(
  title: string,
  jobFamilies: string[],
): string[] {
  if (!title) return [];
  if (!jobFamilies.includes(ART_FAMILY)) return [];

  const titleTrustsWonhwa = TRUST_TITLE_PATTERN.test(title);
  if (!titleTrustsWonhwa && OTHER_DISCIPLINE_PATTERN.test(title)) {
    return [];
  }

  const subtypes: string[] = [];
  const hasCharacter = CHARACTER_PATTERN.test(title);
  if (hasCharacter) subtypes.push(ART_SUBTYPE_CHARACTER);

  const hasBackground =
    BACKGROUND_EXPLICIT_PATTERN.test(title) ||
    (CONCEPT_PATTERN.test(title) && !hasCharacter);
  if (hasBackground) subtypes.push(ART_SUBTYPE_BACKGROUND);

  return subtypes;
}
