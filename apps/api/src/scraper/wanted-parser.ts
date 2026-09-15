import type { RawJob } from './raw-job';

const BASE = 'https://www.wanted.co.kr';

/**
 * 게임 아트 공고 매칭용 정규식.
 * Wanted의 chaos API는 "디자인" 일반 카테고리만 필터 가능하므로
 * client-side에서 position 텍스트를 이 정규식으로 한 번 더 거른다.
 * (docs/superpowers/scraping-notes.md "원티드 — 게임 원화 적합도 제약" 참조)
 */
export const ART_KEYWORD_REGEX =
  /원화|일러스트|컨셉|배경원|캐릭터|2D\s*아트|3D\s*아트|애니메이터|game\s*artist|concept\s*art|아트디렉터|아트팀|일러스트레이터|2D\s*모션|모션그래픽/i;

interface WantedRawJob {
  id: number;
  position: string;
  due_time: string | null;
  company: { id: number; name: string };
  address: { location?: string; district?: string };
}

interface WantedResponse {
  data: WantedRawJob[];
  links: { prev: string | null; next: string | null };
}

function safeParse(json: string): WantedResponse | null {
  try {
    const obj = JSON.parse(json) as Partial<WantedResponse>;
    if (!obj || !Array.isArray(obj.data)) return null;
    return obj as WantedResponse;
  } catch {
    return null;
  }
}

export function parseWantedList(json: string): RawJob[] {
  const parsed = safeParse(json);
  if (!parsed) return [];
  return parsed.data
    .filter(
      (j) => j && typeof j.id === 'number' && typeof j.position === 'string',
    )
    .filter((j) => ART_KEYWORD_REGEX.test(j.position))
    .map((j) => {
      const tags: string[] = [];
      if (j.address?.location) tags.push(j.address.location);
      return {
        source: 'wanted' as const,
        sourceId: String(j.id),
        company: j.company?.name?.trim() ?? '',
        companyUrl: j.company?.id ? `${BASE}/company/${j.company.id}` : '',
        title: j.position.trim(),
        detailUrl: `${BASE}/wd/${j.id}`,
        deadline: (j.due_time ?? '상시').trim(),
        // chaos API는 등록시각을 주지 않음 — 빈 문자열로 두면
        // relative-time 파서가 now를 반환(주기적 재스크래핑 시 lastSeenAt이 보조 정렬키 역할).
        registeredAtText: '',
        tags,
        // 이 소스는 목록에 직군 라벨을 주지 않는다. 게임잡만 채운다.
        jobFamilies: [],
      };
    });
}

export function parseWantedTotalPages(json: string): number {
  const parsed = safeParse(json);
  if (!parsed) return 1;
  return parsed.links?.next ? 2 : 1;
}
