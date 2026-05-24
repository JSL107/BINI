# BINI — 게임 원화 채용공고 통합 보드

5개 채용 사이트를 병렬 스크래핑해서 한 화면에서 보여주는 멀티소스 잡 보드.
실시간 사용자 요청 경로와 cron 적재 경로를 분리해 Vercel 함수 timeout과 격리한다.

## 어디서 어떤 공고를 가져오는가

| 소스 | 메서드 | 비고 |
|---|---|---|
| 게임잡 (`gamejob`) | `POST /Recruit/_GI_Job_List/` (원화 직군 5번) | 메인 소스, 페이지당 40건 |
| 잡코리아 (`jobkorea`) | `GET /Search?stext=게임+원화` (RSC SSR) | client-side art 키워드 필터 |
| 사람인 (`saramin`) | `GET /zf_user/search/recruit?searchword=게임 원화` | 원화 카테고리 자동 매칭 |
| 인크루트 (`incruit`) | `GET /jobdb_list/searchjob.asp?cd=12690` | EUC-KR 디코딩 필요 (iconv-lite) |
| 원티드 (`wanted`) | `GET /api/v4/jobs?category_tags=959` | 공개 chaos API, 페이지당 ~1건 (best-effort) |

추가로 `/companies` 라우트는 [GameForPeople/korea-game-career-site](https://github.com/GameForPeople/korea-game-career-site) README를 파싱해 35개 게임사의 자체 채용 페이지 링크 목록을 보여준다.

## 아키텍처 한 장 요약

```
사용자 브라우저  ─GET /api/jobs─▶  Vercel API
                                    │
                                    ├─▶ JobsCronService.getJobsFromDb()  ─▶ Postgres
                                    │   (사용자 요청 경로 — 스크래퍼 호출 없음, 함수 timeout 안전)
                                    │
                                    └─▶ /api/companies/career-sites   ─▶ GitHub raw README (24h 캐시)

GitHub Actions (3시간마다)  ─▶  apps/api/src/scripts/cron-jobs.ts
                                    │
                                    ├─▶ JobsCronService.scrapeAndUpsert()
                                    │     │
                                    │     ├─▶ Promise.allSettled([
                                    │     │     GamejobScraperService.fetchJobList(page),
                                    │     │     WantedScraperService.fetchJobList(page),
                                    │     │     JobkoreaScraperService.fetchJobList(page),
                                    │     │     SaraminScraperService.fetchJobList(page),
                                    │     │     IncruitScraperService.fetchJobList(page),
                                    │     │   ])
                                    │     │
                                    │     ├─▶ dedupeJobs(rawJobs)  ── 회사명+제목 정규화 매칭
                                    │     └─▶ prisma.$transaction(upserts)
                                    │
                                    └─▶ sweepExpired()  ── 7일 lastSeenAt 넘은 잡 expiredAt 마킹

GitHub Actions (6시간마다)  ─▶  apps/crawler  ── Playwright Chromium
                                    │
                                    └─▶ Google 이미지 검색 ─▶ game_images 테이블 적재
                                        (API 런타임은 Playwright 절대 임포트하지 않음)
```

## 핵심 디자인 결정

- **id 형식**: `<source>:<sourceId>` (예: `gamejob:280563`, `wanted:363680`). 소스 간 ID 충돌 방지.
- **Dedup 키**: 회사명+제목을 lowercase + 공백/기호 제거 후 비교. 첫 등장 소스가 primary, 나머지는 `alternateSources[]`로 흡수(메모리만).
- **소스 실패 정책**: `Promise.allSettled`로 격리. 1개 실패해도 `failedSources` 메타로 노출하고 계속. 전체 실패만 502.
- **art 키워드 필터**: wanted/jobkorea는 결과가 art가 아닌 직군 포함 → `ART_KEYWORD_REGEX` client-side 필터링. saramin/incruit/gamejob은 카테고리 사전 필터 적용된 검색이라 추가 필터 불필요.
- **사용자 요청 = DB-only**: Vercel 함수 timeout(10s)을 회피하기 위해 실시간 스크래핑은 GH Actions로 분리.
- **이미지 크롤러 분리**: Playwright는 `apps/crawler` 워크스페이스에만 존재. Vercel API 번들은 슬림 유지.

## 디렉토리 구조

```
BINI/
├─ apps/
│  ├─ api/                    # NestJS — 사용자 요청 + cron 진입점
│  │  ├─ src/scraper/         # 소스별 파서·서비스 (cheerio, iconv-lite, fetch)
│  │  ├─ src/jobs/            # JobsCronService(쓰기), JobsController(읽기), dedupeJobs
│  │  ├─ src/companies/       # /api/companies/career-sites 엔드포인트
│  │  ├─ src/images/          # game_images DB 조회 (Playwright 안 씀)
│  │  ├─ prisma/              # schema.prisma + migrations
│  │  └─ test/fixtures/       # 각 소스의 픽스처 HTML/JSON (TDD 입력)
│  ├─ crawler/                # Playwright Google 이미지 크롤러 (격리된 워크스페이스)
│  └─ web/                    # Next.js 16 — App Router, 홈 + /companies
│     └─ src/components/
│        ├─ JobCard.tsx       # 소스 배지 + alternateSources 카운트
│        ├─ JobsGridWithFilter.tsx  # 클라이언트 사이드 소스 필터 칩
│        └─ JobImageCarousel.tsx    # 게임/회사 이미지 캐러셀
├─ packages/types/            # 두 앱이 공유하는 Job/Source/Response 타입
├─ .github/workflows/
│  ├─ refresh-jobs.yml        # 3시간 cron: 스크래핑 + dedup + upsert + expire sweep
│  └─ refresh-images.yml      # 6시간 cron: Google 이미지 크롤
└─ docs/superpowers/
   ├─ plans/                  # 단계별 구현 계획
   ├─ specs/                  # 디자인 문서
   └─ scraping-notes.md       # 각 소스의 요청·셀렉터·인코딩 메모
```

## 로컬 개발

```bash
# 1) 워크스페이스 설치
pnpm install

# 2) 공유 타입 빌드 (다른 패키지가 의존)
pnpm --filter @bini/types build

# 3) Postgres 시작 (Docker 예시 — 다른 환경이면 DATABASE_URL만 맞추면 됨)
docker run --name bini-pg -e POSTGRES_PASSWORD=bini -e POSTGRES_DB=bini -p 5433:5432 -d postgres:16

# 4) Prisma 마이그레이션
cd apps/api && pnpm exec prisma migrate dev && cd ../..

# 5) API + Web 따로 실행
pnpm --filter api start:dev   # http://localhost:3000
pnpm --filter web dev          # http://localhost:3001

# 6) 한 번 적재해 보기 (DB가 비어 있으면 화면도 비어 있음)
DATABASE_URL=postgresql://postgres:bini@localhost:5433/bini node apps/api/dist/src/scripts/cron-jobs.js
```

## 자주 쓰는 명령

```bash
# 전체 테스트
pnpm --filter api test         # 86+ Jest 테스트
pnpm --filter web exec vitest run  # 28+ Vitest 테스트

# 빌드
pnpm --filter api build
pnpm --filter web build

# 단일 파서 디버그
pnpm --filter api test -- wanted-parser

# Google 이미지 크롤 1회 (Playwright)
DATABASE_URL=... pnpm --filter crawler crawl
```

## 알려진 한계

- **Wanted**: 공개 chaos API의 `category_tags` 파라미터가 사실상 무시됨 → art 매칭률 페이지당 ~1건. 헤드리스 우회 없이는 개선 불가. 자세한 조사 결과는 `docs/superpowers/scraping-notes.md` 참조.
- **인크루트**: EUC-KR 응답이라 모든 fetch에 `iconv-lite` 디코딩 필요.
- **dedup**: 회사명+제목 정규화 매칭. 같은 공고를 다르게 표기한 경우(예: "[프로젝트X] ..." vs "프로젝트X ...")는 잡지만, 부분적으로 다른 표현은 못 잡음. 라이브 검증에서 페이지당 ~2건 cross-site 매칭.

## 라이선스

내부 프로젝트. 외부 게재용 라이선스 미정.
