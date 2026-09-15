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
 */

export const ART_SUBTYPE_CHARACTER = '캐릭터';
export const ART_SUBTYPE_BACKGROUND = '배경·컨셉';

const ART_FAMILY = '원화';

const CHARACTER_PATTERN = /캐릭터|character/iu;
const BACKGROUND_EXPLICIT_PATTERN = /배경|environment/iu;
const CONCEPT_PATTERN = /컨셉|콘셉|concept/iu;

/** 붙일 하위 구분 목록. 배타가 아니라 둘 다 붙을 수 있다. */
export function extractArtSubtypes(
  title: string,
  jobFamilies: string[],
): string[] {
  if (!title) return [];
  if (!jobFamilies.includes(ART_FAMILY)) return [];

  const subtypes: string[] = [];
  const hasCharacter = CHARACTER_PATTERN.test(title);
  if (hasCharacter) subtypes.push(ART_SUBTYPE_CHARACTER);

  const hasBackground =
    BACKGROUND_EXPLICIT_PATTERN.test(title) ||
    (CONCEPT_PATTERN.test(title) && !hasCharacter);
  if (hasBackground) subtypes.push(ART_SUBTYPE_BACKGROUND);

  return subtypes;
}
