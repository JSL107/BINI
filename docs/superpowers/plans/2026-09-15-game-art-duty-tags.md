# 게임 아트 직군 확장 + 직군 태그 분리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임잡 수집을 원화 단독에서 아트 4개 직군으로 넓히고, 직군을 별도 컬럼으로 분리해 원화 목록이 덮이지 않게 한다.

**Architecture:** 게임잡 목록 HTML의 `onclick` 속성에서 게시자가 단 직군 라벨을 뽑아 `RawJob.jobFamilies`로 나른다. cron 단계에서 채용 대상이 아닌 공고(학원 강사·웹툰·비아트 직군)를 제목 기준으로 버리고(축 A), 남은 공고에는 직군과 원화 하위 구분을 파생 컬럼으로 저장한다(축 B). `tags` 컬럼은 사이트 원문 칩이므로 건드리지 않는다.

**Tech Stack:** NestJS 10, Prisma 7, cheerio 1.2, Jest(api), Vitest(web), pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-09-15-game-art-duty-tags-design.md`

## Global Constraints

- **작업 위치**: `/Users/juneseok/Desktop/backend/기타/BINI-wt-art-duty-tags` (브랜치 `feat/art-duty-tags`, base `origin/feature/gamejob-wonhwa-scraper`). 메인 트리 `BINI/`는 머지되지 않은 `perf/next-image-migration` 위에 있으므로 **건드리지 않는다**.
- **의존성 추가 금지.** cheerio는 이미 있다. 새 패키지를 깔지 않는다.
- **`Job.tags`의 의미를 바꾸지 않는다.** 사이트 원문 문자열을 카드 칩으로 뿌리는 컬럼이다(`JobCard.tsx:102`). 직군은 별도 컬럼에 담는다.
- **파생 속성은 cron 시점 계산 → 컬럼 저장** 관례를 따른다(`job-attributes.ts` → `experienceLevel`·`locations` 등).
- **직군 라벨은 게임잡 원문 그대로** 쓴다: `원화`, `모델링`, `애니메이션`, `이펙트·FX`, `인터페이스 디자인` 등. 영문 슬러그로 바꾸지 않는다.
- **축 A(제외)는 제목만 본다.** 직군 라벨이 아트 계열이어도 면제하지 않는다 — 실측에서 웹툰 작가 공고가 `원화` 직군을 달고 있었다.
- 테스트 이름은 한국어로 쓴다(기존 spec 파일 관례).
- 첫 설치가 필요하면 워크트리 루트에서 `pnpm install --frozen-lockfile=false`.
- api 검증: `pnpm --filter api test` / `pnpm --filter api lint`. web 검증: `pnpm --filter web exec vitest run`.

---

### Task 1: 파서가 직군을 뽑는다

`onclick` 속성의 첫 번째 `IsNullOrWhiteSpace('...')` 인자가 직군 목록이다. 두 번째는 장르, 세 번째는 지역이다. 여섯 번째 위치 인자는 `'없음'`이거나 `'Sword 채용관'`처럼 값이 달라져 위치로 세면 안 된다 — `IsNullOrWhiteSpace(` 출현 순서로만 세야 안전하다.

**Files:**
- Modify: `apps/api/src/scraper/raw-job.ts`
- Modify: `apps/api/src/scraper/gamejob-parser.ts`
- Test: `apps/api/src/scraper/gamejob-parser.spec.ts`
- Fixture (수정 없음, 그대로 사용): `apps/api/test/fixtures/gamejob-wonhwa-list.html`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `RawJob.jobFamilies: string[]` — 게임잡 원문 직군 라벨 배열. 다른 소스(사람인·잡코리아·인크루트·원티드)는 빈 배열을 넣는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/src/scraper/gamejob-parser.spec.ts` 의 `describe('parseJobList', ...)` 블록 안에 추가한다.

```typescript
  it('onclick에서 직군 라벨을 추출한다', () => {
    const first = parseJobList(html)[0];
    expect(first.sourceId).toBe('280518');
    expect(first.jobFamilies).toEqual([
      '인터페이스 디자인',
      '원화',
      '애니메이션',
      '이펙트·FX',
    ]);
  });

  it('픽스처 40건 모두 직군이 비어 있지 않다', () => {
    const jobs = parseJobList(html);
    expect(jobs.length).toBe(40);
    expect(jobs.every((j) => j.jobFamilies.length > 0)).toBe(true);
  });

  it('원화 직군이 픽스처 전 건에 달려 있다', () => {
    const jobs = parseJobList(html);
    expect(jobs.filter((j) => j.jobFamilies.includes('원화')).length).toBe(40);
  });

  it('장르·지역을 직군으로 잘못 읽지 않는다', () => {
    const jobs = parseJobList(html);
    const all = jobs.flatMap((j) => j.jobFamilies);
    expect(all).not.toContain('모바일게임');
    expect(all).not.toContain('온라인PC게임');
    expect(all.some((f) => f.includes('>'))).toBe(false);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/scraper/gamejob-parser.spec.ts -t 직군`
Expected: FAIL — `jobFamilies` 가 `undefined` 라 `toEqual` 이 깨지고, TypeScript 컴파일에서 `RawJob` 에 해당 속성이 없다고 나온다.

- [ ] **Step 3: `RawJob` 에 필드를 더한다**

`apps/api/src/scraper/raw-job.ts` 의 `RawJob` 인터페이스 끝에 추가한다.

```typescript
export interface RawJob {
  source: JobSource;
  sourceId: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAtText: string;
  tags: string[];
  /**
   * 게시자가 공고에 단 직군 라벨(게임잡 원문). 예: ['원화', '애니메이션'].
   * 게임잡 외 소스는 이 정보를 목록에 주지 않으므로 빈 배열이다.
   */
  jobFamilies: string[];
}
```

- [ ] **Step 4: 파서에 추출 함수를 더한다**

`apps/api/src/scraper/gamejob-parser.ts` 의 `extractOnclickTitle` 함수 바로 아래에 추가한다.

```typescript
/**
 * onclick 의 GA_Application_Prdt 호출에서 직군 라벨 목록을 뽑는다.
 *
 * IsNullOrWhiteSpace(...) 인자는 출현 순서대로 직군 · 장르 · 지역이다.
 * 위치 인자(6번째 등)는 '없음' / 'Sword 채용관' 처럼 값이 달라져 쉼표로 세면 어긋나므로,
 * IsNullOrWhiteSpace 출현 순서만 신뢰한다.
 */
function extractOnclickJobFamilies(onclick: string): string[] {
  if (!onclick) return [];
  const match = onclick.match(/IsNullOrWhiteSpace\('([^']*)'\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
```

- [ ] **Step 5: 파서가 그 값을 담게 한다**

같은 파일에서 `const onclick = detailAnchor.attr('onclick') ?? '';` 아래에 한 줄을 넣고, `jobs.push({...})` 객체에 필드를 더한다.

```typescript
    const onclick = detailAnchor.attr('onclick') ?? '';
    const jobFamilies = extractOnclickJobFamilies(onclick);
    // Fix 1: <strong> text is primary; onclick GA_Application_Prdt 3rd arg is fallback
    const title = strongText || extractOnclickTitle(onclick);
```

```typescript
    jobs.push({
      source: 'gamejob',
      sourceId: id,
      company,
      companyUrl,
      title,
      detailUrl,
      deadline,
      registeredAtText,
      tags,
      jobFamilies,
    });
```

- [ ] **Step 6: 다른 소스 파서 4곳에 빈 배열을 채운다**

`RawJob` 이 필수 필드라 나머지 파서가 컴파일에서 깨진다. 각 파일의 `jobs.push({...})` (원티드는 `.map(...)` 반환 객체)에 `jobFamilies: []` 를 추가한다.

- `apps/api/src/scraper/saramin-parser.ts`
- `apps/api/src/scraper/jobkorea-parser.ts`
- `apps/api/src/scraper/incruit-parser.ts`
- `apps/api/src/scraper/wanted-parser.ts`

```typescript
      tags,
      // 이 소스는 목록에 직군 라벨을 주지 않는다. 게임잡만 채운다.
      jobFamilies: [],
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter api test`
Expected: PASS — 신규 4건 포함 전체 초록.

- [ ] **Step 8: 커밋**

```bash
git add apps/api/src/scraper/
git commit -m "feat(scraper): extract gamejob job families from onclick"
```

---

### Task 2: 축 A — 제외 필터

채용 대상이 아닌 공고를 버린다. 과잉 제거가 정탐을 죽이므로 **규칙군별 제외 건수를 셀 수 있게** 만든다. 이 계수는 Task 5에서 cron 로그에 실린다.

**Files:**
- Create: `apps/api/src/jobs/job-exclusion.ts`
- Test: `apps/api/src/jobs/job-exclusion.spec.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type ExclusionRule = '교육·강사' | '웹툰·출판' | '비아트 직군' | '아트 밖 디자인'`
  - `classifyExclusion(title: string): ExclusionRule | null` — 버려야 하면 규칙명, 아니면 `null`
  - `countExclusions(titles: string[]): Record<ExclusionRule, number>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/src/jobs/job-exclusion.spec.ts` 를 새로 만든다. 제외 대상 제목은 2026-09-15 게임잡 duty=5 실측에서 그대로 가져왔고, 제외되면 안 되는 제목도 같은 회차에서 가져왔다.

```typescript
import { classifyExclusion, countExclusions } from './job-exclusion';

describe('classifyExclusion', () => {
  it.each([
    ['[SBS아카데미게임학원] 평일 게임원화 강사 모집', '교육·강사'],
    ['[전국/온라인]아트트리아카데미 웹툰/일러스트/게임원화 강사 모집', '교육·강사'],
    ['한화에어로스페이스 참여기업 전액국비지원 AI실무인재 양성과정 교육생 모집', '교육·강사'],
    ['[청월당(로켓AI)] 웹툰 작가 채용', '웹툰·출판'],
    ['[컴투스] [일본 IP 프로젝트] 카툰 렌더링&그래픽스 프로그래머 (3년 이상)', '비아트 직군'],
    ['[신규 프로젝트] 시나리오 / 캐릭터 설정 기획 모집', '비아트 직군'],
    ['[부산] 게임 마케팅/사업PM/글로벌GM(외국어가능)', '비아트 직군'],
    ['[NC][단기계약직] [Blade&Soul] 게임 내 아이템, 아이콘 디자이너 모집', '아트 밖 디자인'],
    ['[비케이브] ACC디자인팀 가방·액세서리 디자이너 경력채용', '아트 밖 디자인'],
  ])('%s → %s 로 제외한다', (title, rule) => {
    expect(classifyExclusion(title)).toBe(rule);
  });

  it.each([
    '[더핑크퐁컴퍼니] 2D 캐릭터 원화가 (문샤크) (6개월 계약직)',
    '[위메이드커넥트] 배경 원화 담당자 모집',
    '[넥슨코리아] 빈딕투스 디파잉 페이트 배경 컨셉 아티스트 (아르바이트)',
    '[크리티카] 3D 캐릭터 모델러 모집',
    '[제우스] 애니메이터',
    '[ 유명 대기업 계열 게임사 ] 아트디렉터(리드급)',
    '[KANA] [아트] 아트 PM',
    '[엘소드] 게임 개발 전 분야 수시 모집',
  ])('%s 는 제외하지 않는다', (title) => {
    expect(classifyExclusion(title)).toBeNull();
  });

  it('제목이 비어도 터지지 않는다', () => {
    expect(classifyExclusion('')).toBeNull();
  });
});

describe('countExclusions', () => {
  it('규칙군별로 센다', () => {
    const counts = countExclusions([
      '[SBS아카데미게임학원] 평일 게임원화 강사 모집',
      '[전국/온라인]아트트리아카데미 웹툰/일러스트/게임원화 강사 모집',
      '[청월당(로켓AI)] 웹툰 작가 채용',
      '[위메이드커넥트] 배경 원화 담당자 모집',
    ]);
    expect(counts['교육·강사']).toBe(2);
    expect(counts['웹툰·출판']).toBe(1);
    expect(counts['비아트 직군']).toBe(0);
    expect(counts['아트 밖 디자인']).toBe(0);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/jobs/job-exclusion.spec.ts`
Expected: FAIL — `Cannot find module './job-exclusion'`

- [ ] **Step 3: 구현한다**

`apps/api/src/jobs/job-exclusion.ts` 를 만든다.

```typescript
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter api exec jest src/jobs/job-exclusion.spec.ts`
Expected: PASS

여기서 "제외하지 않는다" 케이스가 깨지면 규칙이 과한 것이다. 규칙을 좁혀라 — 테스트를 고치지 마라. 정탐을 버리는 비용이 노이즈를 들이는 비용보다 크다.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/jobs/job-exclusion.ts apps/api/src/jobs/job-exclusion.spec.ts
git commit -m "feat(jobs): add axis-A exclusion rules with per-rule counters"
```

---

### Task 3: 원화 하위 구분 (캐릭터 / 배경·컨셉)

게임잡 직군 라벨에는 `원화` 하나뿐이고 캐릭터와 배경을 나눠주지 않아 제목에서 뽑는다. **직군이 `원화` 인 공고에만 적용**한다 — 그러지 않으면 "3D 캐릭터 모델러"에 `캐릭터` 가 붙어 원화 탭에 3D 모델러가 올라온다.

**Files:**
- Create: `apps/api/src/jobs/art-subtype.ts`
- Test: `apps/api/src/jobs/art-subtype.spec.ts`

**Interfaces:**
- Consumes: Task 1 의 `RawJob.jobFamilies`
- Produces: `extractArtSubtypes(title: string, jobFamilies: string[]): string[]` — `['캐릭터']` · `['배경·컨셉']` · 둘 다 · `[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/src/jobs/art-subtype.spec.ts` 를 만든다.

```typescript
import { extractArtSubtypes } from './art-subtype';

const 원화 = ['원화'];

describe('extractArtSubtypes', () => {
  it('캐릭터 원화를 잡는다', () => {
    expect(
      extractArtSubtypes('[더핑크퐁컴퍼니] 2D 캐릭터 원화가 (문샤크)', 원화),
    ).toEqual(['캐릭터']);
  });

  it('배경·컨셉 원화를 잡는다', () => {
    expect(
      extractArtSubtypes('[위메이드커넥트] 배경 원화 담당자 모집', 원화),
    ).toEqual(['배경·컨셉']);
  });

  it('영문 표기도 잡는다', () => {
    expect(
      extractArtSubtypes('[Loonshot Games] Sr. Character Concept Artist', 원화),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('둘 다 있으면 둘 다 붙인다', () => {
    expect(
      extractArtSubtypes('[신규 프로젝트] 캐릭터/배경 원화가', 원화),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('단서가 없으면 빈 배열이다', () => {
    expect(extractArtSubtypes('[신입/경력] 게임 아트 원화가 모집', 원화)).toEqual(
      [],
    );
  });

  it('원화 직군이 아니면 캐릭터가 있어도 붙이지 않는다', () => {
    expect(
      extractArtSubtypes('[크리티카] 3D 캐릭터 모델러 모집', ['모델링']),
    ).toEqual([]);
    expect(
      extractArtSubtypes('[KANA] 3D 캐릭터 애니메이터', ['애니메이션']),
    ).toEqual([]);
  });

  it('원화를 겸하는 공고에는 붙인다', () => {
    expect(
      extractArtSubtypes('[신규 프로젝트] 캐릭터/배경 원화가', [
        '게임개발(모바일)',
        '인터페이스 디자인',
        '원화',
        '이펙트·FX',
      ]),
    ).toEqual(['캐릭터', '배경·컨셉']);
  });

  it('직군이 비어 있으면 붙이지 않는다', () => {
    expect(extractArtSubtypes('캐릭터 원화가 모집', [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/jobs/art-subtype.spec.ts`
Expected: FAIL — `Cannot find module './art-subtype'`

- [ ] **Step 3: 구현한다**

`apps/api/src/jobs/art-subtype.ts` 를 만든다.

```typescript
/**
 * 원화 안에서 캐릭터 / 배경·컨셉을 가른다.
 *
 * 게임잡 직군 라벨은 `원화` 하나뿐이고 하위를 나눠주지 않아 제목에서 뽑는다.
 * 2026-09-15 실측(duty=5 120건)에서 제목만으로 43%가 갈렸다(캐릭터 28 · 배경·컨셉 24).
 *
 * 직군이 `원화` 인 공고에만 적용한다. 그러지 않으면 모델링 직군의 "3D 캐릭터 모델러"에
 * 캐릭터가 붙어 원화 탭에 3D 모델러가 올라온다 — 같은 실측에서 duty=6 의 캐릭터 포함
 * 공고 15건이 대부분 3D 모델러였다.
 */

export const ART_SUBTYPE_CHARACTER = '캐릭터';
export const ART_SUBTYPE_BACKGROUND = '배경·컨셉';

const ART_FAMILY = '원화';

const CHARACTER_PATTERN = /캐릭터|character/iu;
const BACKGROUND_PATTERN = /배경|컨셉|콘셉|concept|environment/iu;

/** 붙일 하위 구분 목록. 배타가 아니라 둘 다 붙을 수 있다. */
export function extractArtSubtypes(
  title: string,
  jobFamilies: string[],
): string[] {
  if (!title) return [];
  if (!jobFamilies.includes(ART_FAMILY)) return [];

  const subtypes: string[] = [];
  if (CHARACTER_PATTERN.test(title)) subtypes.push(ART_SUBTYPE_CHARACTER);
  if (BACKGROUND_PATTERN.test(title)) subtypes.push(ART_SUBTYPE_BACKGROUND);
  return subtypes;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter api exec jest src/jobs/art-subtype.spec.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/jobs/art-subtype.ts apps/api/src/jobs/art-subtype.spec.ts
git commit -m "feat(jobs): split wonhwa postings into character/background subtypes"
```

---

### Task 4: 게임잡이 아트 4개 직군을 수집한다

`condition[duty]=5` 고정을 4개 직군 순회로 바꾼다. 같은 공고가 여러 직군에 등록돼 있으면 `GI_No` 가 같으므로 병합하고, 직군은 공고가 실제로 달고 있는 값을 쓴다(요청한 duty 코드가 아니다).

기존 코드는 `jobs.length === 0` 이면 "구조 변경 의심" 예외를 던진다. 직군별로 호출이 쪼개지므로 **한 직군이 0건인 것과 전 직군이 0건인 것을 구분**해야 한다. 전자는 정상일 수 있고 후자만 구조 변경 신호다.

**Files:**
- Modify: `apps/api/src/scraper/gamejob-scraper.service.ts`
- Test: `apps/api/src/scraper/gamejob-scraper.service.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 1 의 `parseJobList` (직군을 채운 `RawJob`)
- Produces: `GamejobScraperService.fetchJobList(page)` — 시그니처 그대로. 반환 `ScrapeResult.jobs` 가 4개 직군 병합 결과가 된다. `ART_DUTY_CODES: readonly string[]` 를 export 해 테스트가 개수를 참조한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/src/scraper/gamejob-scraper.service.spec.ts` 를 만든다. 실제 HTTP 를 때리지 않도록 `global.fetch` 를 가짜로 바꾼다.

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GamejobScraperService, ART_DUTY_CODES } from './gamejob-scraper.service';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-wonhwa-list.html'),
  'utf-8',
);

const okResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

describe('GamejobScraperService', () => {
  let service: GamejobScraperService;
  let calls: string[];

  beforeEach(() => {
    service = new GamejobScraperService();
    calls = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('아트 4개 직군을 요청한다', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      calls.push(String((init as RequestInit).body));
      return Promise.resolve(okResponse(html));
    });

    await service.fetchJobList(1);

    expect(calls.length).toBe(4);
    expect(ART_DUTY_CODES).toEqual(['5', '6', '7', '8']);
    for (const code of ART_DUTY_CODES) {
      expect(
        calls.some((body) => body.includes(`condition%5Bduty%5D=${code}`)),
      ).toBe(true);
    }
  });

  it('직군 간 중복 공고를 GI_No 로 합친다', async () => {
    // 4회 모두 같은 픽스처(40건) → 병합 후에도 40건이어야 한다.
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(html));

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
    const ids = result.jobs.map((j) => j.sourceId);
    expect(new Set(ids).size).toBe(40);
  });

  it('한 직군이 실패해도 나머지 결과를 돌려준다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      if (n === 2) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(html));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });

  it('전 직군이 실패하면 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));

    await expect(service.fetchJobList(1)).rejects.toThrow();
  });

  it('전 직군이 0건이면 구조 변경으로 보고 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('<html></html>'));

    await expect(service.fetchJobList(1)).rejects.toThrow(/구조 변경/);
  });

  it('일부 직군만 0건인 것은 정상으로 본다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      return Promise.resolve(okResponse(n === 1 ? html : '<html></html>'));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/scraper/gamejob-scraper.service.spec.ts`
Expected: FAIL — `ART_DUTY_CODES` 를 못 찾아 컴파일이 깨지고, 호출이 1회뿐이라 `calls.length` 단언도 실패한다.

- [ ] **Step 3: 서비스를 다시 쓴다**

`apps/api/src/scraper/gamejob-scraper.service.ts` 전체를 아래로 바꾼다.

```typescript
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '@bini/types';
import { parseJobList, parseTotalPages } from './gamejob-parser';
import type { RawJob, ScrapeResult } from './raw-job';
import type { JobScraper } from './scraper.interface';

const LIST_URL = 'https://www.gamejob.co.kr/Recruit/_GI_Job_List/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 수집 대상 아트 직군. 5=원화 · 6=모델링 · 7=애니메이션 · 8=이펙트·FX.
 *
 * 게임잡은 21개 직군을 두고 있으나 아트 4개만 받는다. UI(4)·영상제작(11)·
 * 플랫폼 디자인(13)·BX(14)와 기획·개발·사운드 계열은 이번 범위 밖이다.
 *
 * 직군 코드는 "무엇을 요청할지"만 정한다. 저장되는 직군 라벨은 공고가 실제로 달고
 * 있는 값이다(gamejob-parser 의 extractOnclickJobFamilies) — duty=6 으로 받은 공고가
 * 원화도 달고 있으면 그 사실이 보존되어야 한다.
 */
export const ART_DUTY_CODES: readonly string[] = ['5', '6', '7', '8'];

@Injectable()
export class GamejobScraperService implements JobScraper {
  readonly source: JobSource = 'gamejob';
  private readonly logger = new Logger(GamejobScraperService.name);

  /** 아트 직군들의 지정 페이지를 등록일순으로 받아 GI_No 로 합친다. */
  async fetchJobList(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      ART_DUTY_CODES.map((duty) => this.fetchDuty(duty, page)),
    );

    const failed: string[] = [];
    const merged = new Map<string, RawJob>();
    let maxTotalPages = 0;

    settled.forEach((result, index) => {
      const duty = ART_DUTY_CODES[index];
      if (result.status === 'rejected') {
        failed.push(duty);
        this.logger.warn(`게임잡 duty=${duty} 실패: ${String(result.reason)}`);
        return;
      }
      maxTotalPages = Math.max(maxTotalPages, result.value.totalPages);
      for (const job of result.value.jobs) {
        // 같은 공고가 여러 직군에 등록돼 있으면 GI_No 가 같다. 직군 라벨은 공고 자신이
        // 들고 오므로 먼저 담긴 것을 그대로 둔다 — 덮어써도 같은 값이다.
        if (!merged.has(job.sourceId)) merged.set(job.sourceId, job);
      }
    });

    if (failed.length === ART_DUTY_CODES.length) {
      throw new BadGatewayException(
        `게임잡 전 직군 요청 실패 (duty: ${failed.join(', ')})`,
      );
    }

    const jobs = [...merged.values()];
    // 한 직군이 0건인 것은 정상일 수 있다(공고가 적은 직군). 전부 0건일 때만
    // 마크업 구조가 바뀐 것으로 본다.
    if (jobs.length === 0) {
      throw new BadGatewayException(
        '게임잡 공고 파싱 결과가 전 직군 0건입니다 (구조 변경 의심).',
      );
    }

    return { jobs, totalPages: maxTotalPages };
  }

  private async fetchDuty(
    duty: string,
    page: number,
  ): Promise<{ jobs: RawJob[]; totalPages: number }> {
    const body = new URLSearchParams({
      'condition[duty]': duty,
      'condition[menucode]': '',
      'condition[tabcode]': '1',
      page: String(page),
      direct: '0',
      order: '3',
      pagesize: '40',
      tabcode: '1',
    }).toString();

    let res: Response;
    try {
      res = await fetch(LIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`게임잡 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`게임잡 요청 실패: HTTP ${res.status}`);
    }

    const html = await res.text();
    return { jobs: parseJobList(html), totalPages: parseTotalPages(html) };
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter api test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/scraper/gamejob-scraper.service.ts apps/api/src/scraper/gamejob-scraper.service.spec.ts
git commit -m "feat(scraper): collect four gamejob art duties and merge by GI_No"
```

---

### Task 5: 컬럼·타입·cron 반영

파생 속성을 컬럼에 담고 cron 이 제외 필터를 적용한다.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260915000000_add_job_families/migration.sql`
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/jobs/jobs-cron.service.ts`
- Test: `apps/api/src/jobs/jobs-cron.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `RawJob.jobFamilies` · Task 2 `classifyExclusion`/`countExclusions` · Task 3 `extractArtSubtypes`
- Produces: `Job.jobFamilies: string[]` · `Job.artSubtypes: string[]` (Prisma 모델과 `@bini/types` 의 `Job` DTO 양쪽)

- [ ] **Step 1: 스키마에 컬럼을 더한다**

`apps/api/prisma/schema.prisma` 의 `Job` 모델에서 기존 파생 속성 블록 아래에 넣는다.

```prisma
  // tags + title에서 cron 시점에 추출되는 derived 속성. UI 필터/통계용.
  experienceLevel String?
  employmentType  String?
  locations       String[] @default([])
  isRemote        Boolean  @default(false)

  /// 게시자가 공고에 단 직군 라벨(게임잡 원문). 예: ["원화","애니메이션"].
  /// 게임잡 외 소스는 목록에 직군을 주지 않아 빈 배열이다.
  /// 빈 배열을 "직군 없음"으로 읽어 조회에서 빼면 기존 공고와 타 소스 공고가 통째로
  /// 사라진다. 조회 계층은 빈 배열을 제외 조건으로 쓰지 않는다.
  jobFamilies     String[] @default([])
  /// 원화 하위 구분. 예: ["캐릭터"], ["배경·컨셉"]. 원화 직군이 아니면 빈 배열이다.
  artSubtypes     String[] @default([])
```

인덱스 블록에 한 줄 더한다.

```prisma
  @@index([jobFamilies])
```

- [ ] **Step 2: 마이그레이션 파일을 만든다**

`apps/api/prisma/migrations/20260915000000_add_job_families/migration.sql`

```sql
ALTER TABLE "jobs" ADD COLUMN "jobFamilies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "jobs" ADD COLUMN "artSubtypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "jobs_jobFamilies_idx" ON "jobs" USING GIN ("jobFamilies");
```

- [ ] **Step 3: 공유 타입에 더한다**

`packages/types/src/index.ts` 의 `Job` 인터페이스에서 `isRemote` 아래에 넣는다.

```typescript
  /** 게시자가 단 직군 라벨. 게임잡만 채운다. 예: ['원화','애니메이션'] */
  jobFamilies: string[];
  /** 원화 하위 구분. 예: ['캐릭터'], ['배경·컨셉'] */
  artSubtypes: string[];
```

- [ ] **Step 4: 실패하는 테스트를 쓴다**

`apps/api/src/jobs/jobs-cron.service.spec.ts` 파일 끝에 붙인다(import 는 파일 상단에 둔다). Task 2·3 의 단위 함수를 다시 시험하는 게 아니라, **cron 이 그 함수들을 실제로 쓰는지**를 본다 — 제외가 upsert 전에 걸리는지, 두 컬럼이 저장되는지.

파일 상단 import 에 더한다.

```typescript
import type { RawJob } from '../scraper/raw-job';
```

파일 끝에 붙인다.

```typescript
function rawJob(over: Partial<RawJob> & { sourceId: string; title: string }): RawJob {
  return {
    source: 'gamejob',
    company: '테스트게임즈',
    companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
    detailUrl: `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${over.sourceId}`,
    deadline: '상시',
    registeredAtText: '1시간 전 등록',
    tags: ['경력무관', '서울 > 강남구', '정규직'],
    jobFamilies: ['원화'],
    ...over,
  };
}

function buildUpsertHarness(jobs: RawJob[]) {
  const upsert = jest.fn((args: unknown) => args);
  const prisma = {
    job: { findMany: jest.fn(async () => []), upsert },
    $transaction: jest.fn(async () => []),
  } as unknown as PrismaService;

  const scraper = {
    source: 'gamejob',
    fetchJobList: jest.fn(async () => ({ jobs, totalPages: 1 })),
  };
  const dead = {
    source: 'wanted',
    fetchJobList: jest.fn(async () => {
      throw new Error('not used');
    }),
  };
  const stub = {} as unknown;
  const service = new JobsCronService(
    scraper as unknown as GamejobScraperService,
    dead as unknown as WantedScraperService,
    dead as unknown as JobkoreaScraperService,
    dead as unknown as SaraminScraperService,
    dead as unknown as IncruitScraperService,
    prisma,
    stub as GamejobDetailService,
    stub as WantedDetailService,
    stub as JobkoreaDetailService,
    stub as IncruitDetailService,
  );
  return { service, upsert };
}

describe('JobsCronService.scrapeAndUpsert — 축 A 제외 + 축 B 태그', () => {
  it('제외 규칙에 걸린 공고는 upsert 하지 않는다', async () => {
    const { service, upsert } = buildUpsertHarness([
      rawJob({ sourceId: '1', title: '[SBS아카데미게임학원] 평일 게임원화 강사 모집' }),
      rawJob({ sourceId: '2', title: '[청월당(로켓AI)] 웹툰 작가 채용' }),
      rawJob({ sourceId: '3', title: '[위메이드커넥트] 배경 원화 담당자 모집' }),
    ]);

    await service.scrapeAndUpsert(1);

    const ids = upsert.mock.calls.map(
      (c) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(ids).toEqual(['gamejob:3']);
  });

  it('scrapedCount 는 제외 전 원시 수신량을 유지한다', async () => {
    const { service } = buildUpsertHarness([
      rawJob({ sourceId: '1', title: '[SBS아카데미게임학원] 평일 게임원화 강사 모집' }),
      rawJob({ sourceId: '3', title: '[위메이드커넥트] 배경 원화 담당자 모집' }),
    ]);

    const result = await service.scrapeAndUpsert(1);

    expect(result.scrapedCount).toBe(2);
    expect(result.dedupedCount).toBe(1);
  });

  it('직군과 원화 하위 구분을 함께 저장한다', async () => {
    const { service, upsert } = buildUpsertHarness([
      rawJob({
        sourceId: '10',
        title: '[신규 프로젝트] 캐릭터/배경 원화가',
        jobFamilies: ['원화', '이펙트·FX'],
      }),
      rawJob({
        sourceId: '11',
        title: '[크리티카] 3D 캐릭터 모델러 모집',
        jobFamilies: ['모델링'],
      }),
    ]);

    await service.scrapeAndUpsert(1);

    const byId = new Map(
      upsert.mock.calls.map((c) => {
        const a = c[0] as {
          where: { id: string };
          create: { jobFamilies: string[]; artSubtypes: string[] };
        };
        return [a.where.id, a.create];
      }),
    );
    expect(byId.get('gamejob:10')?.jobFamilies).toEqual(['원화', '이펙트·FX']);
    expect(byId.get('gamejob:10')?.artSubtypes).toEqual(['캐릭터', '배경·컨셉']);
    // 원화 직군이 아니면 캐릭터가 제목에 있어도 하위 구분이 붙지 않는다.
    expect(byId.get('gamejob:11')?.jobFamilies).toEqual(['모델링']);
    expect(byId.get('gamejob:11')?.artSubtypes).toEqual([]);
  });
});
```

- [ ] **Step 5: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/jobs/jobs-cron.service.spec.ts -t 축`
Expected: FAIL — 첫 테스트는 제외가 없어 3건 전부 upsert 되고, 셋째 테스트는 `jobFamilies` 가 `create` 에 없어 `undefined` 다.

- [ ] **Step 6: cron 에 제외 필터를 끼운다**

`apps/api/src/jobs/jobs-cron.service.ts` 의 `scrapeAndUpsert` 에서, 전 소스 실패 검사 **뒤**·`groups` 계산 **앞**에 넣는다. 제외는 dedup 이전에 해야 버릴 공고가 그룹 대표(primary)가 되는 일이 없다.

```typescript
    const exclusionCounts = countExclusions(allRaw.map((j) => j.title));
    const keptRaw = allRaw.filter((j) => classifyExclusion(j.title) === null);
    const excludedCount = allRaw.length - keptRaw.length;
```

이후 `allRaw` 를 쓰던 곳을 `keptRaw` 로 바꾼다. 단 로그의 `allRaw.length`(원시 수신량)와 반환값 `scrapedCount` 는 **원시 건수를 유지**한다 — 수신량과 채택량은 다른 사실이고, 둘을 합치면 수집이 줄었는지 필터가 세졌는지 구분할 수 없다.

파일 상단에 import 를 더한다.

```typescript
import { classifyExclusion, countExclusions } from './job-exclusion';
import { extractArtSubtypes } from './art-subtype';
```

- [ ] **Step 7: upsert 에 두 컬럼을 싣는다**

같은 파일의 `const common = {...}` 에서 `isRemote` 아래에 더한다.

```typescript
          isRemote: attrs.isRemote,
          jobFamilies: member.jobFamilies,
          artSubtypes: extractArtSubtypes(member.title, member.jobFamilies),
```

- [ ] **Step 8: 로그에 계수를 남긴다**

같은 파일의 `this.logger.log(...)` 호출을 아래로 바꾼다. 규칙별 제외 건수가 보여야 과잉 제거를 잡을 수 있다.

```typescript
    const exclusionSummary = Object.entries(exclusionCounts)
      .filter(([, n]) => n > 0)
      .map(([rule, n]) => `${rule} ${n}`)
      .join(', ');
    this.logger.log(
      `page ${page}: ${allRaw.length}건 raw → ${excludedCount}건 제외` +
        (exclusionSummary ? `(${exclusionSummary})` : '') +
        ` → ${dedupedCount}건 dedup → ${newCount}건 신규 (upserted ${upserts.length})` +
        (failedSources.length ? ` (failed: ${failedSources.join(',')})` : ''),
    );
```

- [ ] **Step 9: DB row → DTO 매핑에 더한다**

같은 파일의 매핑 함수(`row: {...}` 타입 선언부, 약 495행)에 두 필드를 넣고 반환 객체에도 더한다.

```typescript
    experienceLevel?: string | null;
    employmentType?: string | null;
    locations?: string[];
    isRemote?: boolean;
    jobFamilies?: string[];
    artSubtypes?: string[];
```

```typescript
    locations: row.locations ?? [],
    jobFamilies: row.jobFamilies ?? [],
    artSubtypes: row.artSubtypes ?? [],
```

- [ ] **Step 10: `Job` 리터럴을 만드는 웹 테스트 두 곳을 고친다**

`Job` 이 필수 필드 두 개를 얻으면 DTO 를 통째로 적어 두는 곳이 컴파일에서 깨진다. 전수는 두 곳이다.

`apps/web/src/components/JobCard.test.tsx` 의 `baseJob` 객체 끝(`isRemote: false,` 아래):

```typescript
  isRemote: false,
  jobFamilies: [],
  artSubtypes: [],
};
```

`apps/web/src/components/JobsGridWithFilter.test.tsx` 의 `mkJob` 기본값(`isRemote: false,` 아래):

```typescript
    isRemote: false,
    jobFamilies: [],
    artSubtypes: [],
```

`apps/api/src/jobs/job-attributes.spec.ts` 도 `isRemote` 를 쓰지만 그건 `JobAttributes` 지 `Job` DTO 가 아니다. 건드리지 않는다.

- [ ] **Step 11: 타입 빌드와 테스트를 돌린다**

Run:
```bash
pnpm --filter @bini/types build
pnpm --filter api exec prisma generate
pnpm --filter api test
pnpm --filter api lint
pnpm --filter web exec vitest run
```
Expected: 전부 성공. `prisma generate` 가 실패하면 Step 1 의 스키마 문법을 확인하라. 이 단계는 DB 연결이 필요 없다 — `migrate deploy` 는 배포 때 돈다. web 테스트를 여기서 함께 돌리는 이유는 타입을 바꾼 것이 이 태스크이기 때문이다 — 깨진 곳을 다음 태스크로 넘기지 않는다.

- [ ] **Step 12: 커밋**

```bash
git add apps/api/prisma packages/types apps/api/src/jobs apps/web/src/components
git commit -m "feat(jobs): persist job families and art subtypes, apply axis-A exclusion"
```

---

### Task 6: 사람인·잡코리아 질의 확장

`QUERY` 상수 하나를 질의 배열로 바꾸고 결과를 공고 ID 로 합친다. 카테고리(`cat_kewd`) 전환은 하지 않는다 — 실측 정확도가 키워드보다 낮았다(스펙 §2.4).

**Files:**
- Modify: `apps/api/src/scraper/saramin-scraper.service.ts`
- Modify: `apps/api/src/scraper/jobkorea-scraper.service.ts`
- Test: `apps/api/src/scraper/saramin-scraper.service.spec.ts` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `SARAMIN_QUERIES: readonly string[]` (사람인), `JOBKOREA_QUERIES: readonly string[]` (잡코리아)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/src/scraper/saramin-scraper.service.spec.ts` 를 만든다.

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SaraminScraperService,
  SARAMIN_QUERIES,
} from './saramin-scraper.service';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/saramin-search.html'),
  'utf-8',
);

const okResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

describe('SaraminScraperService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('세 개의 질의를 보낸다', async () => {
    const urls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      urls.push(String(url));
      return Promise.resolve(okResponse(html));
    });

    await new SaraminScraperService().fetchJobList(1);

    expect(SARAMIN_QUERIES).toEqual(['게임 원화', '캐릭터 원화', '원화가']);
    expect(urls.length).toBe(3);
    for (const q of SARAMIN_QUERIES) {
      expect(
        urls.some((u) => u.includes(encodeURIComponent(q).replace(/%20/g, '+'))),
      ).toBe(true);
    }
  });

  it('질의 간 중복 공고를 sourceId 로 합친다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(html));

    const result = await new SaraminScraperService().fetchJobList(1);
    const ids = result.jobs.map((j) => j.sourceId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('한 질의가 실패해도 나머지를 돌려준다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      if (n === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(html));
    });

    const result = await new SaraminScraperService().fetchJobList(1);

    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it('전 질의가 실패하면 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));

    await expect(new SaraminScraperService().fetchJobList(1)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter api exec jest src/scraper/saramin-scraper.service.spec.ts`
Expected: FAIL — `SARAMIN_QUERIES` 가 없어 컴파일이 깨진다.

- [ ] **Step 3: 사람인 서비스를 고친다**

`apps/api/src/scraper/saramin-scraper.service.ts` 에서 `const QUERY = '게임 원화';` 를 지우고 아래로 바꾼다.

```typescript
/**
 * 사람인 검색 질의. 카테고리(cat_kewd=1562, 원화) 전환은 기각했다 — 2026-09-15 실측에서
 * 카테고리 적합률 51% vs 키워드 72%. 게시자가 카테고리를 중복 선택할 수 있어 "부문별
 * 통합 채용" 공고가 모든 칸에 들어가고, 사람인의 "원화"는 게임 한정이 아니라 애니메이션
 * 원화(동화·채색)와 패션 소재 디자이너까지 포함한다.
 *
 * `컨셉 아티스트`·`게임 일러스트`는 각 35건 이상을 새로 물어오지만 마케팅·3D 모델러·
 * 편집 디자이너가 섞여 나왔고 개별 정확도를 재지 않았다. 축 A 필터를 한 회차 돌려
 * 실제 정화율을 본 뒤 추가를 판단한다.
 */
export const SARAMIN_QUERIES: readonly string[] = [
  '게임 원화',
  '캐릭터 원화',
  '원화가',
];
```

그리고 `fetchJobList` 를 아래로 바꾼다.

```typescript
  async fetchJobList(page: number): Promise<ScrapeResult> {
    const settled = await Promise.allSettled(
      SARAMIN_QUERIES.map((query) => this.fetchQuery(query, page)),
    );

    const merged = new Map<string, RawJob>();
    let maxTotalPages = 0;
    let failed = 0;

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        failed += 1;
        this.logger.warn(
          `사람인 "${SARAMIN_QUERIES[index]}" 실패: ${String(result.reason)}`,
        );
        continue;
      }
      maxTotalPages = Math.max(maxTotalPages, result.value.totalPages);
      for (const job of result.value.jobs) {
        if (!merged.has(job.sourceId)) merged.set(job.sourceId, job);
      }
    }

    if (failed === SARAMIN_QUERIES.length) {
      throw new BadGatewayException('사람인 전 질의 요청 실패');
    }

    return { jobs: [...merged.values()], totalPages: maxTotalPages };
  }

  private async fetchQuery(
    query: string,
    page: number,
  ): Promise<{ jobs: RawJob[]; totalPages: number }> {
    const params = new URLSearchParams({
      searchType: 'search',
      searchword: query,
      recruitPage: String(page),
    });
    const url = `https://www.saramin.co.kr/zf_user/search/recruit?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`사람인 요청 실패: ${message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`사람인 요청 실패: HTTP ${res.status}`);
    }
    const html = await res.text();
    return {
      jobs: parseSaraminList(html),
      totalPages: parseSaraminTotalPages(html),
    };
  }
```

import 에 `RawJob` 타입을 더한다.

```typescript
import type { RawJob, ScrapeResult } from './raw-job';
```

- [ ] **Step 4: 잡코리아에 같은 구조를 적용한다**

`apps/api/src/scraper/jobkorea-scraper.service.ts` 에 Step 3 과 같은 모양을 적용한다. 상수 이름과 URL 만 다르다.

```typescript
/** 잡코리아 검색 질의. 선정 근거는 saramin-scraper.service.ts 의 SARAMIN_QUERIES 주석 참조. */
export const JOBKOREA_QUERIES: readonly string[] = [
  '게임 원화',
  '캐릭터 원화',
  '원화가',
];
```

`fetchQuery` 안의 URL 은 기존 그대로 둔다. **검색어 파라미터만 상수에서 인자로 바뀌고, 나머지
파라미터는 한 글자도 건드리지 않는다** — 특히 `tabType: 'recruit'` 을 빠뜨리면 잡코리아가 다른
검색 탭을 돌려주는데, 파싱은 조용히 0건이 되어 실패로도 안 잡힌다.

```typescript
    const params = new URLSearchParams({
      stext: query,
      tabType: 'recruit',
      Page_No: String(page),
    });
    const url = `https://www.jobkorea.co.kr/Search/?${params.toString()}`;
```

실패 시 메시지는 `잡코리아 전 질의 요청 실패` 로 쓴다.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter api test && pnpm --filter api lint`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/scraper/saramin-scraper.service.ts apps/api/src/scraper/saramin-scraper.service.spec.ts apps/api/src/scraper/jobkorea-scraper.service.ts
git commit -m "feat(scraper): widen saramin/jobkorea queries and merge by source id"
```

---

### Task 7: 카드에 직군 배지를 단다

직군은 원문 칩(`tags`)과 섞지 않고 그 위에 별도 줄로 둔다. 원화 하위 구분이 있으면 그것을 먼저 보여준다 — 기준이 게임 원화·캐릭터 원화라 가장 먼저 읽혀야 한다.

**Files:**
- Modify: `apps/web/src/components/JobCard.tsx`
- Test: `apps/web/src/components/JobCard.test.tsx`

**Interfaces:**
- Consumes: Task 5 의 `Job.jobFamilies` · `Job.artSubtypes`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/components/JobCard.test.tsx` 의 `describe('JobCard', ...)` 블록 안에 추가한다. 이 파일에는 이미 `baseJob: Job` 상수가 있고(Task 5 Step 10 에서 두 필드를 빈 배열로 채워 뒀다), 기존 테스트가 `render(<JobCard job={baseJob} />)` 형태로 쓴다. 같은 방식으로 필요한 필드만 덮어쓴다.

```typescript
  it('원화 하위 구분을 배지로 보여준다', () => {
    render(
      <JobCard
        job={{ ...baseJob, jobFamilies: ['원화'], artSubtypes: ['캐릭터'] }}
      />,
    );
    expect(screen.getByText('캐릭터')).toBeInTheDocument();
  });

  it('하위 구분이 없으면 직군 라벨을 보여준다', () => {
    render(
      <JobCard
        job={{ ...baseJob, jobFamilies: ['모델링'], artSubtypes: [] }}
      />,
    );
    expect(screen.getByText('모델링')).toBeInTheDocument();
  });

  it('직군이 비어 있으면 배지 줄을 그리지 않는다', () => {
    const { container } = render(
      <JobCard job={{ ...baseJob, jobFamilies: [], artSubtypes: [] }} />,
    );
    expect(container.querySelector('[data-testid="job-families"]')).toBeNull();
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter web exec vitest run src/components/JobCard.test.tsx`
Expected: FAIL — 배지가 렌더되지 않아 `getByText` 가 못 찾는다.

- [ ] **Step 3: 카드에 배지를 넣는다**

`apps/web/src/components/JobCard.tsx` 의 제목 `<a>` 와 `job.tags` 칩 `<div>` 사이에 넣는다.

```tsx
        {(job.artSubtypes.length > 0 || job.jobFamilies.length > 0) && (
          <div data-testid="job-families" className="flex flex-wrap gap-1">
            {(job.artSubtypes.length > 0
              ? job.artSubtypes
              : job.jobFamilies
            ).map((label) => (
              <span
                key={label}
                className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              >
                {label}
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter web exec vitest run`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/JobCard.tsx apps/web/src/components/JobCard.test.tsx
git commit -m "feat(web): show job family / art subtype badge on job card"
```

---

### Task 8: 전체 검증과 표본 육안 확인

자동 테스트는 규칙이 "내가 쓴 대로" 도는 것만 증명한다. 규칙 자체가 맞는지는 실제 수집 결과를 눈으로 봐야 안다. 스펙 §7·§9 가 요구하는 단계다.

**Files:**
- 변경 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 없음

- [ ] **Step 1: 전체 게이트를 돌린다**

Run:
```bash
pnpm --filter @bini/types build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter web exec vitest run
```
Expected: 넷 다 exit 0. 하나라도 깨지면 여기서 멈추고 고친다.

- [ ] **Step 2: 실제 수집을 한 회차 돌려 표본을 뽑는다**

DB 없이 스크래퍼만 돌려 결과를 찍는 임시 스크립트를 워크트리 밖(스크래치 디렉터리)에 만든다. 커밋하지 않는다.

```bash
cat > /tmp/sample-art.ts <<'EOF'
import { GamejobScraperService } from './apps/api/src/scraper/gamejob-scraper.service';
import { classifyExclusion } from './apps/api/src/jobs/job-exclusion';
import { extractArtSubtypes } from './apps/api/src/jobs/art-subtype';

async function main() {
  const { jobs } = await new GamejobScraperService().fetchJobList(1);
  const kept = jobs.filter((j) => classifyExclusion(j.title) === null);
  console.log(`수신 ${jobs.length}건 → 제외 ${jobs.length - kept.length}건 → 채택 ${kept.length}건`);
  for (const j of kept.slice(0, 25)) {
    const sub = extractArtSubtypes(j.title, j.jobFamilies);
    console.log(`[${sub.join('/') || j.jobFamilies.join('/')}] ${j.title}`);
  }
  console.log('\n--- 제외된 것 ---');
  for (const j of jobs.filter((x) => classifyExclusion(x.title))) {
    console.log(`(${classifyExclusion(j.title)}) ${j.title}`);
  }
}
void main();
EOF
pnpm --filter api exec ts-node /tmp/sample-art.ts
```

- [ ] **Step 3: 출력을 눈으로 검사한다**

세 가지를 확인한다.

1. **제외 목록에 원화 공고가 없는가.** 있으면 그 규칙이 과한 것이다 — Task 2 로 돌아가 규칙을 좁히고 테스트에 그 제목을 "제외하지 않는다" 케이스로 추가한다.
2. **채택 목록에 학원 강사·웹툰·프로그래머가 남아 있는가.** 있으면 규칙을 더하고 Task 2 테스트에 추가한다.
3. **`[캐릭터]`·`[배경·컨셉]` 배지가 제목과 맞는가.** 스펙 §9 가 요구하는 표본 육안 검증이다. 20건 이상 확인한다.

- [ ] **Step 4: 규칙을 고쳤으면 테스트를 갱신하고 다시 돌린다**

Step 3 에서 규칙을 건드렸다면 반드시 그 제목을 Task 2 또는 Task 3 의 spec 에 케이스로 넣는다. 테스트 없이 규칙만 고치면 다음 사람이 되돌린다.

Run: `pnpm --filter api test`
Expected: PASS

- [ ] **Step 5: 임시 스크립트를 지우고 커밋한다**

```bash
rm -f /tmp/sample-art.ts
git status --short   # 워크트리에 임시 파일이 남지 않았는지 확인
git add -A
git commit -m "test(jobs): tighten exclusion rules from live sample review" || echo "변경 없음 — 커밋 생략"
```

- [ ] **Step 6: 검증 결과를 기록한다**

이 계획 파일 맨 아래에 실측 결과를 적는다. 다음 사람이 규칙을 만질 때의 기준선이 된다.

```markdown
## 검증 결과 (YYYY-MM-DD)

- 수집 1회: 수신 N건 → 제외 M건 → 채택 K건
- 규칙별 제외: 교육·강사 a / 웹툰·출판 b / 비아트 직군 c / 아트 밖 디자인 d
- 표본 육안 20건: 직군 태그 정확 N건, 하위 구분 정확 M건
- 규칙 수정: (했으면 무엇을 왜)
- 미검증: DB 적재·웹 렌더는 서버가 내려가 있어 확인하지 못함
```

---

## 범위 밖 (이 계획에서 하지 않는 것)

- UI(duty 4)·영상제작(11)·플랫폼 디자인(13)·BX(14) 등 나머지 아트 직군
- 기획·개발·사운드 계열 직군
- 자체 채용 페이지(그리팅 ATS 등), 해외 잡보드
- 캐릭터/배경 **탭 UI** — 컬럼과 카드 배지까지만 한다. 탭 분리와 필터는 별도 설계가 필요하다.
- `컨셉 아티스트`·`게임 일러스트` 질의 추가 — Task 8 결과를 보고 판단한다.
- BINI 서버 복구·배포 — 사용자가 따로 처리한다.
