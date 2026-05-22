# 게임잡 원화 채용공고 + 게임 이미지 갤러리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임잡 원화 직종 채용공고를 등록일순으로 스크래핑해 웹페이지에 카드로 보여주고, 각 공고의 게임 이미지를 네이버 이미지 검색에서 가져와 함께 표시한다.

**Architecture:** pnpm 모노레포. NestJS API가 게임잡을 실시간 스크래핑해 Postgres에 upsert하고 REST로 제공한다. Next.js 웹이 공고 목록을 서버에서 받아 즉시 렌더하고, 게임 이미지는 카드별로 비동기 로딩한다. 외부 HTML 의존(게임잡·네이버)은 순수 파서 함수로 격리해 픽스처 기반으로 테스트한다.

**Tech Stack:** NestJS 10, Prisma 7 (driver-adapter 아키텍처, `prisma-client` 제너레이터, `prisma.config.ts`), Vercel Postgres(PostgreSQL), cheerio, Next.js 15(App Router), TypeScript, Jest(api), Vitest + React Testing Library(web), pnpm workspaces.

**관련 문서:** 설계서 `docs/superpowers/specs/2026-05-22-gamejob-wonhwa-scraper-design.md`

---

## 파일 구조

```
BINI/
├─ package.json                      # 루트 워크스페이스
├─ pnpm-workspace.yaml
├─ .npmrc
├─ tsconfig.base.json                # 공통 컴파일러 옵션
├─ packages/
│  └─ types/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/index.ts                # Job, JobsResponse, GameImageResponse 등 공유 타입
├─ apps/
│  ├─ api/                           # NestJS
│  │  ├─ prisma/schema.prisma
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ prisma/                   # PrismaModule, PrismaService
│  │  │  ├─ title/title-parser.ts     # 순수 함수: 제목 → 검색어 분류
│  │  │  ├─ time/relative-time.ts     # 순수 함수: 상대시간 → Date
│  │  │  ├─ scraper/gamejob-scraper.service.ts
│  │  │  ├─ scraper/gamejob-parser.ts # 순수 함수: HTML → RawJob[]
│  │  │  ├─ image/image-provider.ts   # ImageProvider 인터페이스
│  │  │  ├─ image/naver-image.ts      # 순수 함수: HTML → 이미지 URL
│  │  │  ├─ image/game-image.service.ts
│  │  │  ├─ jobs/jobs.service.ts
│  │  │  ├─ jobs/jobs.controller.ts
│  │  │  ├─ images/images.service.ts
│  │  │  └─ images/images.controller.ts
│  │  ├─ test/fixtures/               # 스크래핑 픽스처 HTML
│  │  └─ api/index.ts                 # Vercel 서버리스 진입점
│  └─ web/                            # Next.js
│     ├─ src/app/page.tsx             # 홈: 공고 목록 + 페이지네이션
│     ├─ src/lib/api.ts               # API 클라이언트
│     ├─ src/components/JobCard.tsx
│     ├─ src/components/GameImage.tsx # 3상태(로딩/이미지/플레이스홀더)
│     └─ src/components/Pagination.tsx
└─ docs/superpowers/
   ├─ specs/2026-05-22-gamejob-wonhwa-scraper-design.md
   ├─ plans/2026-05-22-gamejob-wonhwa-scraper.md
   └─ scraping-notes.md               # Task 7/9 산출물: 실제 요청 파라미터 기록
```

각 파서(`gamejob-parser.ts`, `naver-image.ts`, `title-parser.ts`, `relative-time.ts`)는 네트워크·DB 의존이 없는 순수 함수다. 서비스 클래스는 순수 함수를 조합하고 HTTP/DB만 담당한다.

---

## Phase 0 — 모노레포 & 스캐폴드

### Task 1: 루트 모노레포 스캐폴드

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`

- [ ] **Step 1: pnpm 설치 확인**

Run: `pnpm --version`
Expected: 8.x 이상 버전 출력. 없으면 `npm install -g pnpm` 후 재실행.

- [ ] **Step 2: 루트 설정 파일 생성**

`package.json`:
```json
{
  "name": "bini",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build:types": "pnpm --filter @bini/types build",
    "dev:api": "pnpm --filter api start:dev",
    "dev:web": "pnpm --filter web dev"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "engines": { "node": ">=20", "pnpm": ">=8" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`.npmrc`:
```
auto-install-peers=true
```

`tsconfig.base.json` (앱·패키지가 공통으로 상속하는 보편 옵션만 둔다. `module`/`moduleResolution`은 패키지마다 다르므로 베이스에 두지 않고 각 `tsconfig.json`에서 지정):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: 설치 검증**

Run: `pnpm install`
Expected: 에러 없이 완료, `node_modules/` 생성.

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json
git commit -m "chore: scaffold pnpm monorepo root"
```

---

### Task 2: 공유 타입 패키지 (`packages/types`)

**Files:**
- Create: `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts`

- [ ] **Step 1: 패키지 설정 생성**

`packages/types/package.json`:
```json
{
  "name": "@bini/types",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "devDependencies": { "typescript": "^5.4.0" }
}
```

`packages/types/tsconfig.json` (`@bini/types`는 CommonJS로 컴파일해 NestJS·Next.js 양쪽에서 소비 가능하게 한다):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 공유 타입 작성**

`packages/types/src/index.ts`:
```ts
export type ImageQueryType = 'game' | 'company';
export type ImageStatus = 'found' | 'not_found' | 'error';

export interface Job {
  id: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAt: string; // ISO 8601
  tags: string[];
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
}

export interface JobsResponse {
  page: number;
  totalPages: number;
  jobs: Job[];
}

export interface GameImageResponse {
  query: string;
  imageUrl: string | null;
  status: ImageStatus;
}
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm --filter @bini/types build`
Expected: `packages/types/dist/index.js`, `index.d.ts` 생성.

- [ ] **Step 4: 커밋**

```bash
git add packages/types
git commit -m "feat: add shared types package"
```

---

### Task 3: NestJS API 스캐폴드 (`apps/api`)

**Files:**
- Create: `apps/api/**` (Nest CLI 생성)

- [ ] **Step 1: NestJS 프로젝트 생성**

Run: `pnpm dlx @nestjs/cli@10 new api --directory apps/api --skip-git --package-manager pnpm --strict`
Expected: `apps/api/src/main.ts` 등 생성.

- [ ] **Step 2: 의존성 추가**

Run:
```bash
pnpm --filter api add cheerio @bini/types@workspace:*
```
Expected: `apps/api/package.json`에 `cheerio`, `@bini/types` 추가.

- [ ] **Step 3: CORS 활성화**

`apps/api/src/main.ts`의 `bootstrap()` 안 `app.listen` 직전에 추가 (`setGlobalPrefix`를 먼저 호출하는 것이 NestJS 관용. CORS 폴백은 와일드카드 대신 로컬 웹 출처로):
```ts
app.setGlobalPrefix('api');
app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
```

- [ ] **Step 4: 부팅 & 테스트 검증**

Run: `pnpm --filter api build && pnpm --filter api test`
Expected: 빌드 성공, 기본 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: scaffold NestJS api app"
```

---

### Task 4: Prisma 설정 & 스키마

> **구현 메모:** 실제 설치 시 Prisma 7이 설치되었다. Prisma 7은 (1) `schema.prisma`의 `datasource`에서 `url`을 제거하고 `prisma.config.ts`로 옮기며, (2) `prisma-client` 제너레이터로 클라이언트를 `apps/api/generated/prisma/`(gitignore)에 생성하고, (3) `PrismaService`가 `@prisma/adapter-pg` 드라이버 어댑터를 사용한다. 아래 Step 3·5 코드 블록은 Prisma 5 기준 원안이며 실제 구현은 Prisma 7 방식이다. `prisma.config.ts`/`prisma.service.ts`는 머신 고유 연결문자열을 하드코딩하지 않고 `DATABASE_URL`만 사용한다(런타임은 미설정 시 fail-loud). `apps/api/package.json`에 `postinstall: prisma generate`를 두어 프레시 클론·CI에서 클라이언트가 재생성되게 한다. 모든 `DateTime` 컬럼은 `@db.Timestamptz(3)`로 타임존을 보존한다(설계서 6절 — 등록일순 정렬 정확성). `prisma.config.ts`는 `DATABASE_URL` 미설정 시 명확히 throw한다(CLI 경로도 fail-loud). `PrismaService`는 `OnModuleDestroy`로 `$disconnect()`한다. `dotenv`·`@types/pg`는 devDependencies에 둔다.

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`, `apps/api/.env`, `apps/api/.env.example`
- Modify: `apps/api/src/app.module.ts`, `apps/api/package.json`

- [ ] **Step 1: Prisma 설치 & 초기화**

Run:
```bash
pnpm --filter api add @prisma/client
pnpm --filter api add -D prisma
cd apps/api && pnpm dlx prisma init --datasource-provider postgresql && cd ../..
```
Expected: `apps/api/prisma/schema.prisma`, `apps/api/.env` 생성.

- [ ] **Step 2: 데이터베이스 준비**

로컬 개발용 Postgres를 준비한다. 둘 중 하나 선택:
- (권장) Vercel Postgres(Neon) 프로젝트를 만들고 연결 문자열 확보
- 또는 Docker: `docker run --name bini-pg -e POSTGRES_PASSWORD=bini -e POSTGRES_DB=bini -p 5432:5432 -d postgres:16`
  연결 문자열: `postgresql://postgres:bini@localhost:5432/bini`

`apps/api/.env`의 `DATABASE_URL`을 확보한 문자열로 설정.
`apps/api/.env.example` 생성:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
WEB_ORIGIN="http://localhost:3000"
```

- [ ] **Step 3: 스키마 작성**

`apps/api/prisma/schema.prisma`의 `generator`/`datasource` 아래에 추가:
```prisma
model Job {
  id             String   @id
  company        String
  companyUrl     String
  title          String
  detailUrl      String
  deadline       String
  registeredAt   DateTime
  tags           String[]
  gameTitle      String?
  imageQuery     String
  imageQueryType String
  firstSeenAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())

  @@index([registeredAt])
  @@map("jobs")
}

model GameImage {
  query      String   @id
  queryType  String
  imageUrl   String?
  status     String
  source     String
  fetchedAt  DateTime @default(now())

  @@map("game_images")
}
```

- [ ] **Step 4: 마이그레이션 실행**

Run: `cd apps/api && pnpm dlx prisma migrate dev --name init && cd ../..`
Expected: `apps/api/prisma/migrations/` 생성, DB에 `jobs`·`game_images` 테이블 생성, Prisma Client 생성.

- [ ] **Step 5: PrismaService / PrismaModule 작성**

`apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`apps/api/src/app.module.ts`의 `imports` 배열에 `PrismaModule` 추가 (import 문 포함).

- [ ] **Step 6: 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts apps/api/.env.example apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add prisma schema and module"
```

---

## Phase 1 — 순수 도메인 로직 (TDD)

### Task 5: 제목 파서 (`title-parser.ts`)

**Files:**
- Create: `apps/api/src/title/title-parser.ts`
- Test: `apps/api/src/title/title-parser.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/title/title-parser.spec.ts`:
```ts
import { parseTitle } from './title-parser';

describe('parseTitle', () => {
  it('대괄호가 게임명이면 game 타입으로 분류한다', () => {
    expect(parseTitle('[p.일렌시아] 배경 도트 디자이너', '게임듀오')).toEqual({
      gameTitle: 'p.일렌시아',
      imageQuery: 'p.일렌시아 게임',
      imageQueryType: 'game',
    });
  });

  it('영문/숫자 혼합 게임명도 game 타입으로 분류한다', () => {
    expect(parseTitle('[던파모바일2D] 2D 도트 아바타 디자이너', '네오플')).toEqual({
      gameTitle: '던파모바일2D',
      imageQuery: '던파모바일2D 게임',
      imageQueryType: 'game',
    });
  });

  it("'신규 프로젝트' 같은 일반어는 company 타입으로 대체한다", () => {
    expect(parseTitle('[신규 프로젝트] 캐릭터/배경 원화가', '슈퍼플럭스')).toEqual({
      gameTitle: null,
      imageQuery: '슈퍼플럭스',
      imageQueryType: 'company',
    });
  });

  it('이중 대괄호의 첫 항목이 조직명이면 company 타입으로 대체한다', () => {
    expect(parseTitle('[프론티어 스튜디오][MMORPG] 캐릭터 원화가', '매드엔진')).toEqual({
      gameTitle: null,
      imageQuery: '매드엔진',
      imageQueryType: 'company',
    });
  });

  it('장르 키워드는 company 타입으로 대체한다', () => {
    expect(parseTitle('[MMORPG] 원화가 모집', '어떤회사')).toEqual({
      gameTitle: null,
      imageQuery: '어떤회사',
      imageQueryType: 'company',
    });
  });

  it('지역/고용형태 태그는 company 타입으로 대체한다', () => {
    expect(parseTitle('[부산/인턴] 2026년 채용', '트리노드')).toEqual({
      gameTitle: null,
      imageQuery: '트리노드',
      imageQueryType: 'company',
    });
  });

  it('대괄호가 없으면 company 타입으로 대체한다', () => {
    expect(parseTitle('(프리랜서·외주 포함) 캐릭터 원화 디자이너', '퍼니팩')).toEqual({
      gameTitle: null,
      imageQuery: '퍼니팩',
      imageQueryType: 'company',
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- title-parser`
Expected: FAIL — `Cannot find module './title-parser'`.

- [ ] **Step 3: 파서 구현**

`apps/api/src/title/title-parser.ts`:
```ts
import type { ImageQueryType } from '@bini/types';

export interface TitleParseResult {
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
}

// 게임명이 아닌, 회사명 대체 검색으로 보내야 하는 키워드
const GENERIC_TERMS = ['신규 프로젝트', '신규프로젝트', '프로젝트', '차기작', '신작', '미정'];
const GENRE_TERMS = ['mmorpg', 'rpg', 'fps', 'tps', 'aos', 'moba', 'rts', 'ccg',
  '캐주얼', '방치형', '서브컬처', '수집형', '시뮬레이션', '퍼즐', '디펜스', '액션', '소셜카지노'];
const PLATFORM_REGION_EMPLOYMENT = ['모바일', 'pc', '콘솔', 'vr', 'ar', '웹',
  '서울', '부산', '경기', '인천', '대구', '대전', '광주', '울산', '경북', '경남', '판교', '성남',
  '인턴', '정규직', '계약직', '신입', '경력', '신입/경력', '병역특례'];
const ORG_SUFFIXES = ['스튜디오', '게임센터', '게임즈', '소프트', '컴퍼니', '엔터테인먼트',
  '주식회사', '코퍼레이션', 'studio', 'games', 'soft'];

function isNonGame(bracket: string): boolean {
  const t = bracket.trim().toLowerCase();
  if (t.length === 0) return true;
  if (GENERIC_TERMS.some((w) => t === w.toLowerCase())) return true;
  if (GENRE_TERMS.some((w) => t.includes(w))) return true;
  if (PLATFORM_REGION_EMPLOYMENT.some((w) => t === w.toLowerCase())) return true; // 정확 매칭 — '모바일'이 '던파모바일2D'를 오탐하지 않도록
  if (ORG_SUFFIXES.some((w) => t.endsWith(w))) return true;
  if (t.includes('/')) return true; // "부산/인턴" 같은 복합 태그
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- title-parser`
Expected: 7개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/title
git commit -m "feat: add title parser for game/company classification"
```

---

### Task 6: 상대시간 파서 (`relative-time.ts`)

**Files:**
- Create: `apps/api/src/time/relative-time.ts`
- Test: `apps/api/src/time/relative-time.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/time/relative-time.spec.ts`:
```ts
import { parseRelativeTime } from './relative-time';

describe('parseRelativeTime', () => {
  const now = new Date('2026-05-22T12:00:00Z');

  it("'4시간 전 등록'을 4시간 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('4시간 전 등록', now).toISOString())
      .toBe('2026-05-22T08:00:00.000Z');
  });

  it("'30분 전 등록'을 30분 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('30분 전 등록', now).toISOString())
      .toBe('2026-05-22T11:30:00.000Z');
  });

  it("'2일 전 등록'을 2일 전 시각으로 변환한다", () => {
    expect(parseRelativeTime('2일 전 등록', now).toISOString())
      .toBe('2026-05-20T12:00:00.000Z');
  });

  it("'방금 전'은 now를 반환한다", () => {
    expect(parseRelativeTime('방금 전 등록', now).toISOString())
      .toBe('2026-05-22T12:00:00.000Z');
  });

  it('해석할 수 없는 문자열은 now를 반환한다', () => {
    expect(parseRelativeTime('알 수 없음', now).toISOString())
      .toBe('2026-05-22T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- relative-time`
Expected: FAIL — `Cannot find module './relative-time'`.

- [ ] **Step 3: 구현**

`apps/api/src/time/relative-time.ts`:
```ts
const UNIT_MS: Record<string, number> = {
  분: 60_000,
  시간: 3_600_000,
  일: 86_400_000,
  주: 604_800_000,
};

/**
 * 게임잡 목록의 상대 등록시간 텍스트("N시간 전 등록" 등)를 절대 시각으로 변환한다.
 * 해석 불가 시 now를 그대로 반환한다(best-effort).
 */
export function parseRelativeTime(text: string, now: Date = new Date()): Date {
  const m = text.match(/(\d+)\s*(분|시간|일|주)\s*전/);
  if (m) {
    const amount = parseInt(m[1], 10);
    return new Date(now.getTime() - amount * UNIT_MS[m[2]]);
  }
  return new Date(now.getTime());
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- relative-time`
Expected: 5개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/time
git commit -m "feat: add relative-time parser for job registration time"
```

---

## Phase 2 — 스크래퍼 (조사 → 픽스처 → 파서)

### Task 7: 게임잡 요청 조사 & 픽스처 캡처

**Files:**
- Create: `apps/api/test/fixtures/gamejob-wonhwa-list.html`, `docs/superpowers/scraping-notes.md`

이 태스크는 코드가 아니라 **조사 산출물**을 만든다. 설계서 12절의 미해결 과제를 여기서 확정한다.

- [ ] **Step 1: 원화 직종 필터 요청 확인**

브라우저에서 `https://www.gamejob.co.kr/Recruit/joblist?menucode=duty` 접속 → 상세검색에서 직종 `원화` 선택 → `등록일순` 정렬 → `40개씩` 설정 → 검색. 개발자도구 Network 탭에서 공고 목록을 반환하는 요청(문서 또는 XHR)을 찾는다.

- [ ] **Step 2: 요청 파라미터 문서화**

`docs/superpowers/scraping-notes.md`에 기록:
```markdown
# 스크래핑 노트

## 게임잡 원화 목록 요청
- 메서드: <GET 또는 POST>
- URL: <전체 URL>
- 원화 직종 필터 파라미터: <파라미터명=값>
- 등록일순 정렬 파라미터: <파라미터명=값>
- 페이지 크기(40개) 파라미터: <파라미터명=값>
- 페이지 번호 파라미터: <파라미터명, 예: Page>
- 필요한 헤더: <User-Agent 등>
- 총 페이지 수 확인 위치: <페이지네이션 DOM 설명>
```

- [ ] **Step 3: 픽스처 HTML 저장**

Step 1의 응답 HTML 전체를 `apps/api/test/fixtures/gamejob-wonhwa-list.html`로 저장한다(브라우저 "페이지 소스 보기" 또는 Network 응답 복사). 공고 행이 최소 10개 이상 포함되어야 한다.

- [ ] **Step 4: 픽스처 내용 확인**

`apps/api/test/fixtures/gamejob-wonhwa-list.html`을 열어 첫 번째 공고의 회사명·제목·`GI_No`·마감일·등록시간·태그를 직접 읽고 `scraping-notes.md`의 "## 첫 공고 기대값" 절에 기록한다(Task 8 테스트의 정답값).

- [ ] **Step 5: 커밋**

```bash
git add apps/api/test/fixtures/gamejob-wonhwa-list.html docs/superpowers/scraping-notes.md
git commit -m "chore: capture gamejob wonhwa list fixture and request notes"
```

---

### Task 8: 게임잡 파서 & 스크래퍼 서비스

**Files:**
- Create: `apps/api/src/scraper/gamejob-parser.ts`, `apps/api/src/scraper/gamejob-scraper.service.ts`, `apps/api/src/scraper/scraper.module.ts`
- Test: `apps/api/src/scraper/gamejob-parser.spec.ts`

- [ ] **Step 1: RawJob 타입 & 실패 테스트 작성**

`apps/api/src/scraper/gamejob-parser.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobList, parseTotalPages } from './gamejob-parser';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-wonhwa-list.html'),
  'utf-8',
);

describe('parseJobList', () => {
  it('픽스처에서 공고 목록을 추출한다', () => {
    const jobs = parseJobList(html);
    expect(jobs.length).toBeGreaterThanOrEqual(10);
  });

  it('첫 공고의 필드를 정확히 파싱한다', () => {
    const first = parseJobList(html)[0];
    // 아래 기대값은 scraping-notes.md의 "첫 공고 기대값"으로 교체한다.
    expect(first.id).toBe('<EXPECTED_GI_NO>');
    expect(first.company).toBe('<EXPECTED_COMPANY>');
    expect(first.title).toBe('<EXPECTED_TITLE>');
    expect(first.detailUrl).toContain('/Recruit/GI_Read/View?GI_No=');
    expect(first.companyUrl).toContain('/Company/Detail');
    expect(first.deadline).toBe('<EXPECTED_DEADLINE>');
    expect(first.registeredAtText).toBe('<EXPECTED_REGISTERED_TEXT>');
    expect(Array.isArray(first.tags)).toBe(true);
  });

  it('잘못된 HTML이면 빈 배열을 반환한다', () => {
    expect(parseJobList('<html><body>no jobs</body></html>')).toEqual([]);
  });
});

describe('parseTotalPages', () => {
  it('픽스처에서 총 페이지 수를 추출한다', () => {
    expect(parseTotalPages(html)).toBeGreaterThanOrEqual(1);
  });
});
```

`<EXPECTED_*>` 자리표시자는 Task 7 Step 4에서 기록한 실제 값으로 **반드시 교체**한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- gamejob-parser`
Expected: FAIL — `Cannot find module './gamejob-parser'`.

- [ ] **Step 3: 파서 구현**

`apps/api/src/scraper/gamejob-parser.ts`:
```ts
import * as cheerio from 'cheerio';

export interface RawJob {
  id: string;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  registeredAtText: string;
  tags: string[];
}

const BASE = 'https://www.gamejob.co.kr';

function abs(href: string | undefined): string {
  if (!href) return '';
  return href.startsWith('http') ? href : `${BASE}${href}`;
}

/**
 * 게임잡 원화 목록 HTML에서 공고 행을 추출한다.
 * 선택자는 test/fixtures/gamejob-wonhwa-list.html 구조에 맞춰 작성한다:
 *  - 각 공고 행을 감싸는 컨테이너 선택자
 *  - 회사명 링크(/Company/Detail), 제목 링크(/Recruit/GI_Read/View?GI_No=)
 *  - 마감일 / "N시간 전 등록" 텍스트 / 태그 요소
 */
export function parseJobList(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  // ROW_SELECTOR: 픽스처에서 공고 한 건을 감싸는 요소 선택자로 교체
  $('ROW_SELECTOR').each((_, el) => {
    const row = $(el);
    const titleLink = row.find('a[href*="/Recruit/GI_Read/View"]').first();
    const detailUrl = abs(titleLink.attr('href'));
    const idMatch = detailUrl.match(/GI_No=(\d+)/);
    if (!idMatch) return; // 공고 행이 아니면 건너뜀

    const companyLink = row.find('a[href*="/Company/Detail"]').first();

    jobs.push({
      id: idMatch[1],
      company: companyLink.text().trim(),
      companyUrl: abs(companyLink.attr('href')),
      title: titleLink.text().replace(/\s+/g, ' ').trim(),
      detailUrl,
      // DEADLINE_SELECTOR / REGISTERED_SELECTOR / TAG_SELECTOR 를 픽스처 구조에 맞춰 교체
      deadline: row.find('DEADLINE_SELECTOR').text().trim(),
      registeredAtText: row.find('REGISTERED_SELECTOR').text().trim(),
      tags: row
        .find('TAG_SELECTOR')
        .map((_, t) => $(t).text().trim())
        .get()
        .filter(Boolean),
    });
  });

  return jobs;
}

/** 페이지네이션에서 총 페이지 수를 추출한다. 없으면 1. */
export function parseTotalPages(html: string): number {
  const $ = cheerio.load(html);
  // PAGINATION_SELECTOR: 픽스처의 페이지 번호 링크 선택자로 교체
  const pages = $('PAGINATION_SELECTOR')
    .map((_, el) => parseInt($(el).text().trim(), 10))
    .get()
    .filter((n) => !Number.isNaN(n));
  return pages.length ? Math.max(...pages) : 1;
}
```

구현 절차: 픽스처 파일을 열어 실제 DOM을 보고 `ROW_SELECTOR`, `DEADLINE_SELECTOR`, `REGISTERED_SELECTOR`, `TAG_SELECTOR`, `PAGINATION_SELECTOR`를 실제 클래스/태그 선택자로 교체한다. `cheerio.load` 동작은 Step 4 테스트로 검증한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- gamejob-parser`
Expected: 4개 테스트 모두 PASS. 실패 시 선택자를 픽스처 구조에 맞게 수정.

- [ ] **Step 5: 스크래퍼 서비스 작성**

`apps/api/src/scraper/gamejob-scraper.service.ts`:
```ts
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { parseJobList, parseTotalPages, RawJob } from './gamejob-parser';

export interface ScrapeResult {
  jobs: RawJob[];
  totalPages: number;
}

@Injectable()
export class GamejobScraperService {
  private readonly logger = new Logger(GamejobScraperService.name);

  /**
   * 원화 직종 목록의 지정 페이지를 스크래핑한다.
   * 요청 URL/파라미터는 docs/superpowers/scraping-notes.md 기준으로 작성한다.
   */
  async fetchJobList(page: number): Promise<ScrapeResult> {
    const url = this.buildUrl(page);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!res.ok) {
      // 스펙 9절: 게임잡 스크래핑 실패 → 502
      throw new BadGatewayException(`게임잡 요청 실패: HTTP ${res.status}`);
    }
    const html = await res.text();
    const jobs = parseJobList(html);
    if (jobs.length === 0) {
      // 파싱 0건 = 구조 변경 또는 차단. 조용히 빈 목록을 반환하지 않는다.
      throw new BadGatewayException('게임잡 공고 파싱 결과가 0건입니다 (구조 변경 의심).');
    }
    return { jobs, totalPages: parseTotalPages(html) };
  }

  /** scraping-notes.md에 문서화된 원화 필터/정렬/페이지 파라미터로 URL을 구성한다. */
  private buildUrl(page: number): string {
    const params = new URLSearchParams({
      menucode: 'duty',
      // scraping-notes.md 기준 실제 파라미터로 교체:
      // 원화 직종 필터 / 등록일순 정렬 / 40개씩 / 페이지
      Page: String(page),
    });
    return `https://www.gamejob.co.kr/Recruit/joblist?${params.toString()}`;
  }
}
```

`buildUrl`의 `URLSearchParams`에 `scraping-notes.md`에서 확정한 원화 필터·등록일순 정렬·40개씩 파라미터를 추가한다. POST 요청으로 확인됐다면 `fetch`를 `method: 'POST'` + `body`로 바꾼다.

- [ ] **Step 6: ScraperModule 작성**

`apps/api/src/scraper/scraper.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';

@Module({
  providers: [GamejobScraperService],
  exports: [GamejobScraperService],
})
export class ScraperModule {}
```

이 모듈은 Task 12의 `JobsModule`이 import한다 (app.module에 직접 등록하지 않음).

- [ ] **Step 7: 빌드 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/src/scraper
git commit -m "feat: add gamejob scraper and html parser"
```

---

### Task 9: 네이버 이미지 검색 조사 & 픽스처 캡처

**Files:**
- Create: `apps/api/test/fixtures/naver-image-search.html`
- Modify: `docs/superpowers/scraping-notes.md`

- [ ] **Step 1: 네이버 이미지 검색 요청 확인**

브라우저에서 네이버 이미지 검색(`https://search.naver.com/search.naver?where=image&query=<검색어>`)으로 게임명(예: `원신 게임`)을 검색한다. 개발자도구 Network 탭에서 이미지 결과가 담긴 응답을 찾는다(검색 결과 문서 자체 또는 XHR).

- [ ] **Step 2: 요청 패턴 문서화**

`docs/superpowers/scraping-notes.md`에 추가:
```markdown
## 네이버 이미지 검색
- URL 패턴: https://search.naver.com/search.naver?where=image&query=<검색어>
- 첫 이미지 URL이 담긴 DOM/JSON 위치: <설명>
- 필요한 헤더: <User-Agent 등>
```

- [ ] **Step 3: 픽스처 저장**

이미지 검색 결과 응답을 `apps/api/test/fixtures/naver-image-search.html`로 저장한다. 결과 이미지가 최소 1개 이상 포함되어야 한다. 첫 이미지의 URL을 직접 읽어 `scraping-notes.md`의 "## 네이버 첫 이미지 기대값"에 기록한다.

- [ ] **Step 4: 커밋**

```bash
git add apps/api/test/fixtures/naver-image-search.html docs/superpowers/scraping-notes.md
git commit -m "chore: capture naver image search fixture and notes"
```

---

### Task 10: 게임 이미지 서비스 (동시성 제한 포함)

**Files:**
- Create: `apps/api/src/image/limit.ts`, `apps/api/src/image/image-provider.ts`, `apps/api/src/image/naver-image.ts`, `apps/api/src/image/game-image.service.ts`, `apps/api/src/image/image.module.ts`
- Test: `apps/api/src/image/limit.spec.ts`, `apps/api/src/image/naver-image.spec.ts`

- [ ] **Step 1: 동시성 제한 유틸 실패 테스트 작성**

스펙 9절: 네이버 차단 방지를 위해 이미지 스크래핑 동시 실행을 3~5개로 제한한다.

`apps/api/src/image/limit.spec.ts`:
```ts
import { createLimiter } from './limit';

describe('createLimiter', () => {
  it('동시 실행 개수를 max로 제한한다', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    await Promise.all(Array.from({ length: 6 }, task));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('모든 작업의 결과를 순서대로 반환한다', async () => {
    const limit = createLimiter(2);
    const results = await Promise.all([1, 2, 3].map((n) => limit(async () => n * 2)));
    expect(results).toEqual([2, 4, 6]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- limit`
Expected: FAIL — `Cannot find module './limit'`.

- [ ] **Step 3: 동시성 제한 유틸 구현**

`apps/api/src/image/limit.ts`:
```ts
/** 동시 실행 개수를 max로 제한하는 간단한 세마포어. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    queue.shift()!();
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
```

- [ ] **Step 4: 유틸 테스트 통과 확인**

Run: `pnpm --filter api test -- limit`
Expected: 2개 테스트 PASS.

- [ ] **Step 5: 네이버 파서 실패 테스트 작성**

`apps/api/src/image/naver-image.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirstImageUrl } from './naver-image';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/naver-image-search.html'),
  'utf-8',
);

describe('parseFirstImageUrl', () => {
  it('네이버 검색결과에서 첫 이미지 URL을 추출한다', () => {
    // 기대값은 scraping-notes.md "네이버 첫 이미지 기대값"으로 교체
    expect(parseFirstImageUrl(html)).toBe('<EXPECTED_IMAGE_URL>');
  });

  it('이미지가 없으면 null을 반환한다', () => {
    expect(parseFirstImageUrl('<html><body>no images</body></html>')).toBeNull();
  });
});
```

`<EXPECTED_IMAGE_URL>`은 Task 9 Step 3에서 기록한 실제 값으로 교체한다.

- [ ] **Step 6: 테스트 실패 확인**

Run: `pnpm --filter api test -- naver-image`
Expected: FAIL — `Cannot find module './naver-image'`.

- [ ] **Step 7: 파서 · 인터페이스 · 서비스 구현**

`apps/api/src/image/naver-image.ts`:
```ts
import * as cheerio from 'cheerio';

/**
 * 네이버 이미지 검색결과 HTML에서 첫 이미지 URL을 추출한다.
 * IMAGE_SELECTOR는 test/fixtures/naver-image-search.html 구조에 맞춰 교체한다.
 */
export function parseFirstImageUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const img = $('IMAGE_SELECTOR').first();
  const url = img.attr('src') ?? img.attr('data-lazysrc') ?? null;
  return url && url.startsWith('http') ? url : null;
}
```

`apps/api/src/image/image-provider.ts`:
```ts
import type { ImageStatus } from '@bini/types';

export interface ImageResult {
  imageUrl: string | null;
  status: ImageStatus;
}

export interface ImageProvider {
  readonly source: string;
  search(query: string): Promise<ImageResult>;
}
```

`apps/api/src/image/game-image.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { ImageProvider, ImageResult } from './image-provider';
import { parseFirstImageUrl } from './naver-image';
import { createLimiter } from './limit';

@Injectable()
export class GameImageService implements ImageProvider {
  readonly source = 'naver';
  private readonly logger = new Logger(GameImageService.name);
  // 스펙 9절: 네이버 동시 스크래핑을 4개로 제한 (싱글턴 서비스의 모듈 단위 큐)
  private readonly limit = createLimiter(4);

  search(query: string): Promise<ImageResult> {
    return this.limit(() => this.doSearch(query));
  }

  private async doSearch(query: string): Promise<ImageResult> {
    try {
      const url =
        'https://search.naver.com/search.naver?where=image&query=' +
        encodeURIComponent(query);
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) {
        this.logger.warn(`네이버 이미지 검색 실패: HTTP ${res.status}`);
        return { imageUrl: null, status: 'error' };
      }
      const imageUrl = parseFirstImageUrl(await res.text());
      return imageUrl
        ? { imageUrl, status: 'found' }
        : { imageUrl: null, status: 'not_found' };
    } catch (err) {
      this.logger.warn(`네이버 이미지 검색 예외: ${String(err)}`);
      return { imageUrl: null, status: 'error' };
    }
  }
}
```

`IMAGE_SELECTOR`를 픽스처 구조에 맞는 선택자로 교체한다.

`apps/api/src/image/image.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { GameImageService } from './game-image.service';

@Module({
  providers: [GameImageService],
  exports: [GameImageService],
})
export class ImageModule {}
```

이 모듈은 Task 13의 `ImagesModule`이 import한다 (app.module에 직접 등록하지 않음).

- [ ] **Step 8: 네이버 파서 테스트 통과 확인**

Run: `pnpm --filter api test -- naver-image`
Expected: 2개 테스트 PASS. 실패 시 `IMAGE_SELECTOR` 수정.

- [ ] **Step 9: 빌드 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/src/image
git commit -m "feat: add naver game image service with concurrency limit"
```

---

## Phase 3 — API 레이어

### Task 11: Jobs 서비스 (upsert + 조회)

**Files:**
- Create: `apps/api/src/jobs/jobs.service.ts`
- Test: `apps/api/src/jobs/jobs.service.spec.ts`

- [ ] **Step 1: 실패 테스트 작성 (Prisma·Scraper 목)**

`apps/api/src/jobs/jobs.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JobsService', () => {
  const sampleRaw = {
    id: '278454',
    company: '게임듀오',
    companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
    title: '[p.일렌시아] 배경 도트 디자이너',
    detailUrl: 'https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454',
    deadline: '상시',
    registeredAtText: '4시간 전 등록',
    tags: ['신입', '경기'],
  };

  function build(scrapeResult: { jobs: any[]; totalPages: number }) {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { job: { upsert, findMany } } as unknown as PrismaService;
    const scraper = {
      fetchJobList: jest.fn().mockResolvedValue(scrapeResult),
    } as unknown as GamejobScraperService;
    return { service: new JobsService(scraper, prisma), upsert, findMany };
  }

  it('스크래핑한 공고를 제목 분류와 함께 upsert한다', async () => {
    const { service, upsert } = build({ jobs: [sampleRaw], totalPages: 3 });
    await service.getJobsPage(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: '278454' });
    expect(arg.create.gameTitle).toBe('p.일렌시아');
    expect(arg.create.imageQueryType).toBe('game');
  });

  it('totalPages를 응답에 포함한다', async () => {
    const { service } = build({ jobs: [sampleRaw], totalPages: 3 });
    const result = await service.getJobsPage(1);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- jobs.service`
Expected: FAIL — `Cannot find module './jobs.service'`.

- [ ] **Step 3: 구현**

`apps/api/src/jobs/jobs.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Job, JobsResponse } from '@bini/types';
import { GamejobScraperService } from '../scraper/gamejob-scraper.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from '../title/title-parser';
import { parseRelativeTime } from '../time/relative-time';

@Injectable()
export class JobsService {
  constructor(
    private readonly scraper: GamejobScraperService,
    private readonly prisma: PrismaService,
  ) {}

  /** 지정 페이지를 실시간 스크래핑 → DB upsert → DB에서 등록일순 반환. */
  async getJobsPage(page: number): Promise<JobsResponse> {
    const { jobs: rawJobs, totalPages } = await this.scraper.fetchJobList(page);
    const now = new Date();

    for (const raw of rawJobs) {
      const parsed = parseTitle(raw.title, raw.company);
      const registeredAt = parseRelativeTime(raw.registeredAtText, now);
      const data = {
        company: raw.company,
        companyUrl: raw.companyUrl,
        title: raw.title,
        detailUrl: raw.detailUrl,
        deadline: raw.deadline,
        registeredAt,
        tags: raw.tags,
        gameTitle: parsed.gameTitle,
        imageQuery: parsed.imageQuery,
        imageQueryType: parsed.imageQueryType,
      };
      await this.prisma.job.upsert({
        where: { id: raw.id },
        create: { id: raw.id, ...data },
        update: { ...data, lastSeenAt: now },
      });
    }

    const ids = rawJobs.map((r) => r.id);
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      orderBy: { registeredAt: 'desc' },
    });

    return { page, totalPages, jobs: rows.map(toJobDto) };
  }
}

function toJobDto(row: {
  id: string; company: string; companyUrl: string; title: string;
  detailUrl: string; deadline: string; registeredAt: Date; tags: string[];
  gameTitle: string | null; imageQuery: string; imageQueryType: string;
}): Job {
  return {
    id: row.id,
    company: row.company,
    companyUrl: row.companyUrl,
    title: row.title,
    detailUrl: row.detailUrl,
    deadline: row.deadline,
    registeredAt: row.registeredAt.toISOString(),
    tags: row.tags,
    gameTitle: row.gameTitle,
    imageQuery: row.imageQuery,
    imageQueryType: row.imageQueryType as Job['imageQueryType'],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- jobs.service`
Expected: 2개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/jobs/jobs.service.ts apps/api/src/jobs/jobs.service.spec.ts
git commit -m "feat: add jobs service with scrape-upsert-read flow"
```

---

### Task 12: Jobs 컨트롤러 (`GET /api/jobs`)

**Files:**
- Create: `apps/api/src/jobs/jobs.controller.ts`, `apps/api/src/jobs/jobs.module.ts`
- Test: `apps/api/src/jobs/jobs.controller.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/api/src/jobs/jobs.controller.spec.ts`:
```ts
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  function build() {
    const getJobsPage = jest.fn().mockResolvedValue({
      page: 2, totalPages: 5, jobs: [],
    });
    const service = { getJobsPage } as unknown as JobsService;
    return { controller: new JobsController(service), getJobsPage };
  }

  it('page 쿼리를 정수로 서비스에 전달한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('2');
    expect(getJobsPage).toHaveBeenCalledWith(2);
  });

  it('page 미지정 시 1페이지를 조회한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs(undefined);
    expect(getJobsPage).toHaveBeenCalledWith(1);
  });

  it('잘못된 page 값은 1로 보정한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('abc');
    expect(getJobsPage).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- jobs.controller`
Expected: FAIL — `Cannot find module './jobs.controller'`.

- [ ] **Step 3: 컨트롤러 & 모듈 구현**

`apps/api/src/jobs/jobs.controller.ts`:
```ts
import { Controller, Get, Query } from '@nestjs/common';
import type { JobsResponse } from '@bini/types';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  getJobs(@Query('page') page?: string): Promise<JobsResponse> {
    const parsed = parseInt(page ?? '1', 10);
    const pageNum = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    return this.jobsService.getJobsPage(pageNum);
  }
}
```

`apps/api/src/jobs/jobs.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
```

`apps/api/src/app.module.ts`의 `imports`에 `JobsModule` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- jobs.controller`
Expected: 3개 테스트 PASS.

- [ ] **Step 5: 빌드 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/src/jobs apps/api/src/app.module.ts
git commit -m "feat: add GET /api/jobs endpoint"
```

---

### Task 13: Images 서비스 & 컨트롤러 (`GET /api/game-image`)

**Files:**
- Create: `apps/api/src/images/images.service.ts`, `apps/api/src/images/images.controller.ts`, `apps/api/src/images/images.module.ts`
- Test: `apps/api/src/images/images.service.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/api/src/images/images.service.spec.ts`:
```ts
import { ImagesService } from './images.service';
import { GameImageService } from '../image/game-image.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImagesService', () => {
  it('DB 캐시 히트 시 스크래핑하지 않는다', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      query: '원신 게임', queryType: 'game',
      imageUrl: 'https://img/cached.jpg', status: 'found',
    });
    const search = jest.fn();
    const prisma = { gameImage: { findUnique, upsert: jest.fn() } } as unknown as PrismaService;
    const provider = { search, source: 'naver' } as unknown as GameImageService;

    const service = new ImagesService(provider, prisma);
    const result = await service.resolve('원신 게임', 'game');

    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({
      query: '원신 게임', imageUrl: 'https://img/cached.jpg', status: 'found',
    });
  });

  it('캐시 미스 시 스크래핑 후 결과를 저장한다', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue(undefined);
    const search = jest.fn().mockResolvedValue({
      imageUrl: 'https://img/new.jpg', status: 'found',
    });
    const prisma = { gameImage: { findUnique, upsert } } as unknown as PrismaService;
    const provider = { search, source: 'naver' } as unknown as GameImageService;

    const service = new ImagesService(provider, prisma);
    const result = await service.resolve('블루아카이브 게임', 'game');

    expect(search).toHaveBeenCalledWith('블루아카이브 게임');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBe('https://img/new.jpg');
    expect(result.status).toBe('found');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter api test -- images.service`
Expected: FAIL — `Cannot find module './images.service'`.

- [ ] **Step 3: 서비스 구현**

`apps/api/src/images/images.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType } from '@bini/types';
import { GameImageService } from '../image/game-image.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImagesService {
  constructor(
    private readonly provider: GameImageService,
    private readonly prisma: PrismaService,
  ) {}

  /** DB 캐시 우선 조회, 미스 시 스크래핑 후 저장. */
  async resolve(query: string, queryType: ImageQueryType): Promise<GameImageResponse> {
    const cached = await this.prisma.gameImage.findUnique({ where: { query } });
    if (cached) {
      return {
        query,
        imageUrl: cached.imageUrl,
        status: cached.status as GameImageResponse['status'],
      };
    }

    const result = await this.provider.search(query);
    await this.prisma.gameImage.upsert({
      where: { query },
      create: {
        query, queryType, imageUrl: result.imageUrl,
        status: result.status, source: this.provider.source,
      },
      update: {
        imageUrl: result.imageUrl, status: result.status,
        source: this.provider.source, fetchedAt: new Date(),
      },
    });
    return { query, imageUrl: result.imageUrl, status: result.status };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter api test -- images.service`
Expected: 2개 테스트 PASS.

- [ ] **Step 5: 컨트롤러 & 모듈 작성**

`apps/api/src/images/images.controller.ts`:
```ts
import { Controller, Get, Query } from '@nestjs/common';
import type { GameImageResponse, ImageQueryType } from '@bini/types';
import { ImagesService } from './images.service';

@Controller('game-image')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get()
  getImage(
    @Query('q') q: string,
    @Query('type') type?: string,
  ): Promise<GameImageResponse> {
    const queryType: ImageQueryType = type === 'company' ? 'company' : 'game';
    return this.imagesService.resolve((q ?? '').trim(), queryType);
  }
}
```

`apps/api/src/images/images.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ImageModule } from '../image/image.module';

@Module({
  imports: [ImageModule],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}
```

`apps/api/src/app.module.ts`의 `imports`에 `ImagesModule` 추가.

- [ ] **Step 6: 빌드 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/src/images apps/api/src/app.module.ts
git commit -m "feat: add GET /api/game-image endpoint with db cache"
```

---

### Task 14: API 수동 통합 검증

**Files:** (없음 — 실행 검증)

- [ ] **Step 1: API 서버 실행**

Run: `pnpm --filter api start`
Expected: `Nest application successfully started`, 포트 3000(또는 설정값) 리슨.

- [ ] **Step 2: 공고 엔드포인트 확인**

Run: `curl "http://localhost:3000/api/jobs?page=1"`
Expected: `{"page":1,"totalPages":N,"jobs":[...]}` — `jobs` 배열에 실제 원화 공고가 등록일순으로 담김. 각 항목에 `gameTitle`, `imageQuery`, `imageQueryType` 포함.

- [ ] **Step 3: 이미지 엔드포인트 확인**

Run: `curl "http://localhost:3000/api/game-image?q=원신%20게임&type=game"`
Expected: `{"query":"원신 게임","imageUrl":"https://...","status":"found"}`.

- [ ] **Step 4: 검증 결과 기록**

문제가 있으면 해당 Task로 돌아가 선택자/파라미터를 수정한다. 정상이면 `scraping-notes.md` 하단에 "## 통합 검증 통과 (날짜)"를 기록하고 커밋.

```bash
git add docs/superpowers/scraping-notes.md
git commit -m "chore: record api integration verification"
```

---

## Phase 4 — Next.js 웹

### Task 15: Next.js 스캐폴드 & 테스트 환경

**Files:**
- Create: `apps/web/**` (create-next-app), `apps/web/vitest.config.ts`, `apps/web/.env.local`, `apps/web/.env.example`

- [ ] **Step 1: Next.js 프로젝트 생성**

Run:
```bash
pnpm create next-app@latest apps/web --ts --app --src-dir --tailwind --eslint --no-import-alias --use-pnpm
```
Expected: `apps/web/src/app/page.tsx` 등 생성.

- [ ] **Step 2: 의존성 추가**

Run:
```bash
pnpm --filter web add @bini/types@workspace:*
pnpm --filter web add -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: 환경변수 & Vitest 설정**

`apps/web/.env.local` 및 `apps/web/.env.example`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`apps/web/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`apps/web/package.json`의 `scripts`에 추가: `"test": "vitest run"`.

- [ ] **Step 4: 검증 & 커밋**

Run: `pnpm --filter web build`
Expected: 빌드 성공.
```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: scaffold Next.js web app with vitest"
```

---

### Task 16: API 클라이언트

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Test: `apps/web/src/lib/api.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/api.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJobs, fetchGameImage } from './api';

afterEach(() => vi.restoreAllMocks());

describe('fetchJobs', () => {
  it('page 쿼리로 jobs 엔드포인트를 호출한다', async () => {
    const json = { page: 2, totalPages: 5, jobs: [] };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    );
    const result = await fetchJobs(2);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('/jobs?page=2'), expect.anything());
    expect(result).toEqual(json);
  });
});

describe('fetchGameImage', () => {
  it('검색어와 타입을 game-image 엔드포인트에 전달한다', async () => {
    const json = { query: '원신 게임', imageUrl: 'https://i/x.jpg', status: 'found' };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    );
    const result = await fetchGameImage('원신 게임', 'game');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/game-image?q=%EC%9B%90%EC%8B%A0%20%EA%B2%8C%EC%9E%84&type=game'),
      expect.anything(),
    );
    expect(result.imageUrl).toBe('https://i/x.jpg');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- api`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: 구현**

`apps/web/src/lib/api.ts`:
```ts
import type { JobsResponse, GameImageResponse, ImageQueryType } from '@bini/types';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export async function fetchJobs(page: number): Promise<JobsResponse> {
  const res = await fetch(`${BASE}/jobs?page=${page}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`공고 목록 요청 실패: HTTP ${res.status}`);
  return res.json();
}

export async function fetchGameImage(
  query: string,
  type: ImageQueryType,
): Promise<GameImageResponse> {
  const url = `${BASE}/game-image?q=${encodeURIComponent(query)}&type=${type}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`이미지 요청 실패: HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- api`
Expected: 2개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib
git commit -m "feat: add web api client"
```

---

### Task 17: GameImage 컴포넌트 (3상태)

**Files:**
- Create: `apps/web/src/components/GameImage.tsx`
- Test: `apps/web/src/components/GameImage.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/components/GameImage.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GameImage } from './GameImage';
import * as api from '../lib/api';

afterEach(() => vi.restoreAllMocks());

describe('GameImage', () => {
  it('로딩 중에는 스켈레톤을 보여준다', () => {
    vi.spyOn(api, 'fetchGameImage').mockReturnValue(new Promise(() => {}));
    render(<GameImage query="원신 게임" type="game" />);
    expect(screen.getByTestId('image-skeleton')).toBeInTheDocument();
  });

  it('성공 시 이미지를 보여준다', async () => {
    vi.spyOn(api, 'fetchGameImage').mockResolvedValue({
      query: '원신 게임', imageUrl: 'https://i/x.jpg', status: 'found',
    });
    render(<GameImage query="원신 게임" type="game" />);
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i/x.jpg'),
    );
  });

  it('결과 없음/실패 시 플레이스홀더를 보여준다', async () => {
    vi.spyOn(api, 'fetchGameImage').mockResolvedValue({
      query: '원신 게임', imageUrl: null, status: 'not_found',
    });
    render(<GameImage query="원신 게임" type="game" />);
    await waitFor(() =>
      expect(screen.getByTestId('image-placeholder')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- GameImage`
Expected: FAIL — `Cannot find module './GameImage'`.

- [ ] **Step 3: 구현**

`apps/web/src/components/GameImage.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ImageQueryType } from '@bini/types';
import { fetchGameImage } from '../lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'image'; url: string }
  | { kind: 'placeholder' };

export function GameImage({ query, type }: { query: string; type: ImageQueryType }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetchGameImage(query, type)
      .then((res) => {
        if (!alive) return;
        setState(
          res.imageUrl
            ? { kind: 'image', url: res.imageUrl }
            : { kind: 'placeholder' },
        );
      })
      .catch(() => alive && setState({ kind: 'placeholder' }));
    return () => {
      alive = false;
    };
  }, [query, type]);

  if (state.kind === 'loading') {
    return <div data-testid="image-skeleton" className="h-40 w-full animate-pulse bg-gray-200" />;
  }
  if (state.kind === 'placeholder') {
    return (
      <div
        data-testid="image-placeholder"
        className="flex h-40 w-full items-center justify-center bg-gray-100 text-sm text-gray-400"
      >
        이미지 없음
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={state.url} alt={query} className="h-40 w-full object-cover" />
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- GameImage`
Expected: 3개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/GameImage.tsx apps/web/src/components/GameImage.test.tsx
git commit -m "feat: add GameImage component with loading/image/placeholder states"
```

---

### Task 18: JobCard 컴포넌트

**Files:**
- Create: `apps/web/src/components/JobCard.tsx`
- Test: `apps/web/src/components/JobCard.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/components/JobCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from './JobCard';
import type { Job } from '@bini/types';

vi.mock('./GameImage', () => ({
  GameImage: ({ query }: { query: string }) => <div data-testid="game-image">{query}</div>,
}));

const job: Job = {
  id: '278454',
  company: '게임듀오',
  companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
  title: '[p.일렌시아] 배경 도트 디자이너',
  detailUrl: 'https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454',
  deadline: '상시',
  registeredAt: '2026-05-22T08:00:00.000Z',
  tags: ['신입', '경기'],
  gameTitle: 'p.일렌시아',
  imageQuery: 'p.일렌시아 게임',
  imageQueryType: 'game',
};

describe('JobCard', () => {
  it('회사명과 제목을 렌더한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('게임듀오')).toBeInTheDocument();
    expect(screen.getByText(/p.일렌시아/)).toBeInTheDocument();
  });

  it('공고 상세 링크를 건다', () => {
    render(<JobCard job={job} />);
    const link = screen.getByRole('link', { name: /배경 도트 디자이너/ });
    expect(link).toHaveAttribute('href', job.detailUrl);
  });

  it('imageQuery와 타입을 GameImage에 전달한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByTestId('game-image')).toHaveTextContent('p.일렌시아 게임');
  });

  it('태그를 모두 렌더한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('신입')).toBeInTheDocument();
    expect(screen.getByText('경기')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- JobCard`
Expected: FAIL — `Cannot find module './JobCard'`.

- [ ] **Step 3: 구현**

`apps/web/src/components/JobCard.tsx`:
```tsx
import type { Job } from '@bini/types';
import { GameImage } from './GameImage';

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <GameImage query={job.imageQuery} type={job.imageQueryType} />
      <div className="space-y-2 p-4">
        <p className="text-sm text-gray-500">{job.company}</p>
        <a
          href={job.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-semibold text-gray-900 hover:underline"
        >
          {job.title}
        </a>
        <div className="flex flex-wrap gap-1">
          {job.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400">마감 {job.deadline}</p>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- JobCard`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/JobCard.tsx apps/web/src/components/JobCard.test.tsx
git commit -m "feat: add JobCard component"
```

---

### Task 19: Pagination 컴포넌트

**Files:**
- Create: `apps/web/src/components/Pagination.tsx`
- Test: `apps/web/src/components/Pagination.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/components/Pagination.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('이전/다음 링크에 올바른 page 쿼리를 건다', () => {
    render(<Pagination page={3} totalPages={5} />);
    expect(screen.getByRole('link', { name: '이전' })).toHaveAttribute('href', '/?page=2');
    expect(screen.getByRole('link', { name: '다음' })).toHaveAttribute('href', '/?page=4');
  });

  it('첫 페이지에서는 이전 링크를 비활성(렌더 안 함)한다', () => {
    render(<Pagination page={1} totalPages={5} />);
    expect(screen.queryByRole('link', { name: '이전' })).toBeNull();
  });

  it('마지막 페이지에서는 다음 링크를 렌더하지 않는다', () => {
    render(<Pagination page={5} totalPages={5} />);
    expect(screen.queryByRole('link', { name: '다음' })).toBeNull();
  });

  it('현재 페이지/전체 페이지를 표시한다', () => {
    render(<Pagination page={3} totalPages={5} />);
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- Pagination`
Expected: FAIL — `Cannot find module './Pagination'`.

- [ ] **Step 3: 구현**

`apps/web/src/components/Pagination.tsx`:
```tsx
import Link from 'next/link';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <nav className="flex items-center justify-center gap-4 py-6">
      {page > 1 && (
        <Link href={`/?page=${page - 1}`} className="rounded border px-3 py-1 hover:bg-gray-50">
          이전
        </Link>
      )}
      <span className="text-sm text-gray-600">
        {page} / {totalPages}
      </span>
      {page < totalPages && (
        <Link href={`/?page=${page + 1}`} className="rounded border px-3 py-1 hover:bg-gray-50">
          다음
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- Pagination`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/Pagination.tsx apps/web/src/components/Pagination.test.tsx
git commit -m "feat: add Pagination component"
```

---

### Task 20: 홈 페이지 (목록 + 에러 상태)

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/error.tsx`

- [ ] **Step 1: 홈 페이지 구현**

`apps/web/src/app/page.tsx` 전체 교체:
```tsx
import { fetchJobs } from '../lib/api';
import { JobCard } from '../components/JobCard';
import { Pagination } from '../components/Pagination';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const parsed = parseInt(pageParam ?? '1', 10);
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

  const data = await fetchJobs(page);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">게임잡 원화 채용공고</h1>
      {data.jobs.length === 0 ? (
        <p className="text-gray-500">공고가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} />
    </main>
  );
}
```

- [ ] **Step 2: 에러 바운더리 구현**

`apps/web/src/app/error.tsx`:
```tsx
'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="mb-4 text-gray-700">공고를 불러오지 못했습니다.</p>
      <button
        onClick={reset}
        className="rounded border px-4 py-2 hover:bg-gray-50"
      >
        다시 시도
      </button>
    </main>
  );
}
```

- [ ] **Step 3: 빌드 & 전체 테스트 검증**

Run: `pnpm --filter web build && pnpm --filter web test`
Expected: 빌드 성공, 모든 테스트 PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/error.tsx
git commit -m "feat: add home page with job grid and error boundary"
```

---

### Task 21: 엔드투엔드 수동 검증

**Files:** (없음 — 실행 검증)

- [ ] **Step 1: API + 웹 동시 실행**

터미널 2개:
- Run: `pnpm --filter api start`
- Run: `pnpm --filter web dev`

- [ ] **Step 2: 브라우저 검증**

`http://localhost:3000`(웹) 접속. 확인 항목:
- 원화 공고가 등록일순으로 카드 그리드에 표시되는가
- 카드마다 게임/회사 이미지가 스켈레톤 → 이미지로 채워지는가, 없으면 플레이스홀더가 뜨는가
- 페이지네이션 "다음"/"이전"이 동작하는가
- API를 끈 상태로 새로고침하면 에러 화면 + "다시 시도" 버튼이 뜨는가

- [ ] **Step 3: 결과 기록 & 커밋**

문제 발견 시 해당 Task로 복귀해 수정. 정상이면:
```bash
git commit --allow-empty -m "chore: e2e manual verification passed"
```

---

## Phase 5 — 배포 설정

### Task 22: Vercel 배포 구성

**Files:**
- Create: `apps/api/api/index.ts`, `apps/api/vercel.json`, `apps/web/vercel.json`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: NestJS 부트스트랩 분리**

`apps/api/src/main.ts`에서 Nest 앱 생성 로직을 재사용 가능한 함수로 분리한다. `bootstrap()` 함수가 `INestApplication`을 반환하도록 하고, 로컬 실행(`require.main === module`일 때만 `app.listen`)과 서버리스 export를 분리한다:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { INestApplication } from '@nestjs/common';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  return app;
}

if (require.main === module) {
  createApp().then((app) => app.listen(process.env.PORT ?? 3000));
}
```

- [ ] **Step 2: Vercel 서버리스 진입점**

`apps/api/api/index.ts`:
```ts
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/main';

let cached: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cached) {
    const app = await createApp();
    await app.init();
    cached = app.getHttpAdapter().getInstance();
  }
  cached!(req, res);
}

export default handler;
```

- [ ] **Step 3: vercel.json 작성**

`apps/api/vercel.json`:
```json
{
  "buildCommand": "pnpm --filter @bini/types build && pnpm --filter api build",
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
}
```

`apps/web/vercel.json`:
```json
{
  "buildCommand": "pnpm --filter @bini/types build && pnpm --filter web build"
}
```

- [ ] **Step 4: 배포 문서화**

`docs/superpowers/scraping-notes.md` 또는 `README.md`에 배포 절차 기록:
- Vercel 프로젝트 2개 생성 (api / web), 각각 Root Directory를 `apps/api` / `apps/web`로 지정
- api 프로젝트: `DATABASE_URL`, `WEB_ORIGIN` 환경변수 설정, Vercel Postgres 연결
  - ⚠️ 서버리스 환경: `DATABASE_URL`은 **풀링된(pooled) 연결 문자열**을 사용한다 (Vercel Postgres/Neon의 pooler 엔드포인트). 함수 인스턴스마다 풀이 생기므로 직접 연결을 쓰면 커넥션 한도가 빠르게 소진된다.
- web 프로젝트: `NEXT_PUBLIC_API_BASE_URL`을 배포된 api URL로 설정
- api 배포 후 `prisma migrate deploy` 실행

- [ ] **Step 5: 빌드 검증 & 커밋**

Run: `pnpm --filter api build`
Expected: 빌드 성공.
```bash
git add apps/api/src/main.ts apps/api/api apps/api/vercel.json apps/web/vercel.json docs/
git commit -m "feat: add vercel deployment config for api and web"
```

---

## 완료 기준

- [ ] 모든 Task의 단위 테스트 통과 (`pnpm --filter api test`, `pnpm --filter web test`)
- [ ] `pnpm --filter api build`, `pnpm --filter web build` 성공
- [ ] Task 21 E2E 수동 검증 통과: 원화 공고가 등록일순으로 표시되고, 게임/회사 이미지가 카드에 로딩되며, 페이지네이션·에러 상태가 동작
- [ ] `docs/superpowers/scraping-notes.md`에 실제 요청 파라미터·선택자 근거가 기록됨
```
