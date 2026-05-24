/**
 * Job.tags + title에서 derived 속성(연차/고용형태/지역/재택)을 추출한다.
 * cron 시점에 한 번 계산해 Job 컬럼에 저장 → 사용자 응답 쿼리는 컬럼만 보고 필터.
 *
 * 입력은 정형화된 자료가 아닌 사이트 raw 텍스트라 부분 일치 + 우선순위 매칭.
 * 모든 매칭은 lowercase + 공백 제거 후 비교한다.
 */

export type ExperienceLevel = 'newcomer' | 'junior' | 'mid' | 'senior' | 'any';
export type EmploymentType =
  | 'fulltime'
  | 'contract'
  | 'parttime'
  | 'freelance'
  | 'intern';

/** 17개 시도 + 재택/원격을 표현하는 사용자-노출용 라벨. UI 필터 칩이 이 라벨을 그대로 쓴다. */
export const KNOWN_LOCATIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;
export type KnownLocation = (typeof KNOWN_LOCATIONS)[number];

const REMOTE_KEYWORDS = ['재택', '원격', '리모트', 'remote', 'home office', 'hybrid'];

/** 우선순위 높은 순서대로(senior > mid > junior > newcomer > any) 매칭. */
const EXPERIENCE_RULES: Array<{ level: ExperienceLevel; patterns: RegExp[] }> = [
  {
    level: 'senior',
    patterns: [
      /시니어/,
      /리드/,
      /수석/,
      /lead/,
      /senior/,
      /경력\s*[5-9]년\s*이상/,
      /경력\s*1[0-9]년/,
      /경력\s*[7-9]년/,
    ],
  },
  {
    level: 'mid',
    patterns: [/미들/, /중급/, /mid\b/, /경력\s*[3-6]년/, /경력\s*[3-6]~?[3-9]년/],
  },
  {
    level: 'junior',
    patterns: [/주니어/, /junior/, /경력\s*[1-3]년/, /경력\s*1~?[2-3]년/],
  },
  {
    level: 'newcomer',
    patterns: [/신입/, /경력무관/, /경력\s*무관/, /무경력/, /신입가능/, /entry.?level/],
  },
  {
    level: 'any',
    patterns: [/경력자?/, /경력\s*[0-9]+\s*년?\s*이상?/],
  },
];

const EMPLOYMENT_RULES: Array<{ type: EmploymentType; patterns: RegExp[] }> = [
  { type: 'intern', patterns: [/인턴십/, /인턴/, /intern/] },
  { type: 'freelance', patterns: [/외주/, /프리랜서/, /아웃소싱/, /freelance/] },
  { type: 'parttime', patterns: [/파트타임/, /시간제/, /part.?time/] },
  { type: 'contract', patterns: [/계약직/, /기간제/, /계약\b/, /contract/] },
  { type: 'fulltime', patterns: [/정규직/, /정규\b/, /full.?time/] },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** tags 배열과 title을 하나의 lowercase 문자열로 합쳐 정규식 매칭에 사용. */
function joinHaystack(tags: string[], title: string): string {
  return normalize([title, ...tags].join(' '));
}

export function extractExperience(
  tags: string[],
  title: string,
): ExperienceLevel | null {
  const hay = joinHaystack(tags, title);
  if (!hay) return null;
  for (const rule of EXPERIENCE_RULES) {
    if (rule.patterns.some((p) => p.test(hay))) return rule.level;
  }
  return null;
}

export function extractEmploymentType(
  tags: string[],
  title: string,
): EmploymentType | null {
  const hay = joinHaystack(tags, title);
  if (!hay) return null;
  for (const rule of EMPLOYMENT_RULES) {
    if (rule.patterns.some((p) => p.test(hay))) return rule.type;
  }
  return null;
}

/** tags + title에서 시도 라벨 추출. 다중 지역 가능. dedup + KNOWN_LOCATIONS 순서 보존. */
export function extractLocations(tags: string[], title: string): KnownLocation[] {
  const hay = joinHaystack(tags, title);
  if (!hay) return [];
  const found = new Set<KnownLocation>();
  for (const loc of KNOWN_LOCATIONS) {
    if (hay.includes(loc.toLowerCase())) found.add(loc);
  }
  return KNOWN_LOCATIONS.filter((l) => found.has(l));
}

export function isRemoteJob(tags: string[], title: string): boolean {
  const hay = joinHaystack(tags, title);
  if (!hay) return false;
  return REMOTE_KEYWORDS.some((k) => hay.includes(k));
}

/** cron upsert가 한 번에 사용하는 묶음 — 4개 derived 컬럼을 한 호출로 채운다. */
export interface JobAttributes {
  experienceLevel: ExperienceLevel | null;
  employmentType: EmploymentType | null;
  locations: KnownLocation[];
  isRemote: boolean;
}

export function computeAttributes(tags: string[], title: string): JobAttributes {
  return {
    experienceLevel: extractExperience(tags, title),
    employmentType: extractEmploymentType(tags, title),
    locations: extractLocations(tags, title),
    isRemote: isRemoteJob(tags, title),
  };
}

const EXPERIENCE_VALUES: ReadonlySet<string> = new Set<ExperienceLevel>([
  'newcomer',
  'junior',
  'mid',
  'senior',
  'any',
]);
const EMPLOYMENT_VALUES: ReadonlySet<string> = new Set<EmploymentType>([
  'fulltime',
  'contract',
  'parttime',
  'freelance',
  'intern',
]);

/** API 쿼리 파라미터 sanitizer — CSV 또는 배열을 받아 알려진 값만 통과시킨다. */
export function parseExperienceQuery(
  raw: string | string[] | undefined,
): ExperienceLevel[] {
  return splitCsv(raw).filter((v): v is ExperienceLevel => EXPERIENCE_VALUES.has(v));
}

export function parseEmploymentTypeQuery(
  raw: string | string[] | undefined,
): EmploymentType[] {
  return splitCsv(raw).filter((v): v is EmploymentType => EMPLOYMENT_VALUES.has(v));
}

export function parseLocationQuery(
  raw: string | string[] | undefined,
): KnownLocation[] {
  const known: ReadonlySet<string> = new Set(KNOWN_LOCATIONS);
  return splitCsv(raw).filter((v): v is KnownLocation => known.has(v));
}

function splitCsv(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  const flat = Array.isArray(raw) ? raw.join(',') : raw;
  return flat
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
