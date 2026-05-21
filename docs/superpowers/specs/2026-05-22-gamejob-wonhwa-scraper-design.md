# 게임잡 원화 채용공고 + 게임 이미지 갤러리 — 설계 문서

- **작성일**: 2026-05-22
- **상태**: 설계 승인됨 (구현 대기)

## 1. 개요

게임잡(gamejob.co.kr)의 **원화 직종 채용공고**를 등록일순으로 스크래핑해 웹페이지에
카드 형태로 보여준다. 각 공고 제목 앞 대괄호에서 게임 제목을 추출하고, 네이버 이미지
검색을 스크래핑해 해당 게임의 이미지를 카드에 함께 표시한다.

## 2. 확정된 요구사항 / 결정

| 항목 | 결정 |
|---|---|
| 결과물 형태 | 웹페이지 (공고 카드 + 이미지 갤러리) |
| 스크래핑 대상 | 게임잡 `원화/일러스트` 직종 카테고리 (`menucode=duty`) |
| 정렬 | 등록일순 (최신순), 40개씩 페이지네이션 — 전체 표시 |
| 갱신 방식 | 페이지 접속 시 실시간 스크래핑 (해당 페이지 단위) |
| 이미지 소스 | 네이버 이미지 검색 결과 직접 스크래핑 (API 키 미사용), 차단 시 폴백 |
| 비게임 대괄호 처리 | 게임명이 아니면 회사명으로 대체 검색 |
| 스택 | NestJS(API) + Next.js(웹) + Prisma + Vercel Postgres + cheerio |
| 배포 | 로컬 PC + Vercel |
| 데이터 저장 | Vercel Postgres에 공고·이미지 전체 영속화 |

## 3. 아키텍처

모노레포(pnpm workspaces). DB가 source of truth이며, 스크래핑은 DB를 실시간으로
갱신하는 역할이다.

```
BINI/
├─ apps/
│  ├─ api/   → NestJS + Prisma  (스크래핑 + REST API + DB)
│  └─ web/   → Next.js          (공고 카드 + 이미지 갤러리 UI)
└─ packages/
   └─ types/ → 공유 TypeScript 타입 (Job, GameImage DTO)
```

## 4. 구성요소

### NestJS API (`apps/api`)

| 모듈/서비스 | 책임 | 의존 |
|---|---|---|
| `GamejobScraperService` | 게임잡 원화 목록 페이지를 HTTP 요청 → cheerio 파싱 → 구조화된 공고 객체 배열 | (없음, 순수 HTTP+파싱) |
| `TitleParserService` | 제목 대괄호 추출 → 게임명 vs 비게임 분류 → 이미지 검색어 결정 (순수 함수) | (없음) |
| `GameImageService` | 검색어로 네이버 이미지 검색 스크래핑 → 이미지 URL. `ImageProvider` 인터페이스 뒤에 둠 | (없음) |
| `JobsService` / `JobsController` | 스크래핑 결과를 DB에 upsert + DB에서 페이지 단위 조회 | Scraper, TitleParser, Prisma |
| `ImagesService` / `ImagesController` | `game_images` 조회 → 미스 시 스크래핑 후 저장 | GameImage, Prisma |
| `PrismaModule` | DB 접근 (Prisma Client) | — |

각 서비스는 단일 책임을 가지며, 외부 의존(게임잡 HTML, 네이버 HTML)은 파서 함수로
격리해 픽스처 기반으로 독립 테스트한다.

### Next.js Web (`apps/web`)

- **홈 페이지**: `/api/jobs?page=N` 호출 → 공고 카드 그리드를 등록일순으로 렌더
- **공고 카드**: 회사명 · 제목 · 태그(경력·지역·게임분야·고용형태) · 마감일 · 등록시간
  · 게임잡 원본 링크 + 이미지 영역
- **이미지 영역**: 클라이언트 컴포넌트가 `/api/game-image`를 지연 호출
  → 스켈레톤 → 이미지 → 실패 시 플레이스홀더
- **페이지네이션**: 하단 컨트롤

## 5. 데이터 흐름

```
[사용자] 페이지 N 접속
   │
   ▼
[Next.js] GET /api/jobs?page=N
   │
   ▼
[NestJS] 게임잡 원화 목록 page=N 실시간 스크래핑(~1-2초)
   → cheerio 파싱 → 각 공고에 TitleParser 적용
   → jobs 테이블에 upsert → DB에서 등록일순 정렬 반환
   │
   ▼
[Next.js] 카드 즉시 렌더 → 카드마다 GET /api/game-image?q=...
   │
   ▼
[NestJS] game_images 조회 → 히트: URL 반환
                          → 미스: 네이버 스크래핑 → 저장 → 반환
   │
   ▼
[카드] 이미지 표시 / 실패 시 플레이스홀더
```

공고 목록은 서버에서 즉시 렌더되어 빠르고, 이미지는 카드별 비동기로 채워져 Vercel
서버리스 함수 타임아웃(10~60초)을 회피한다.

## 6. DB 스키마 (Prisma)

### `jobs`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | TEXT PK | 게임잡 `GI_No` |
| `company` | TEXT | 회사명 |
| `companyUrl` | TEXT | 회사 페이지 URL |
| `title` | TEXT | 공고 제목 전체 |
| `detailUrl` | TEXT | `/Recruit/GI_Read/View?GI_No=...` |
| `deadline` | TEXT | "상시" · "채용시" · "04/03(금)" 등 원문 |
| `registeredAt` | TIMESTAMPTZ | "4시간 전 등록" 등 상대시간을 절대시각으로 변환. 등록일순 정렬 기준 |
| `tags` | TEXT[] | 경력·학력·지역·게임분야·고용형태 |
| `gameTitle` | TEXT? | 추출된 게임명 (없으면 null) |
| `imageQuery` | TEXT | 이미지 검색어 |
| `imageQueryType` | TEXT | `game` \| `company` |
| `firstSeenAt` | TIMESTAMPTZ | 최초 발견 시각 (insert 시) |
| `lastSeenAt` | TIMESTAMPTZ | 최근 발견 시각 (upsert 시 갱신) |

### `game_images`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `query` | TEXT PK | 정규화된 검색어 |
| `queryType` | TEXT | `game` \| `company` |
| `imageUrl` | TEXT? | 결과 없으면 null |
| `status` | TEXT | `found` \| `not_found` \| `error` |
| `source` | TEXT | `naver` (폴백 시 다른 값) |
| `fetchedAt` | TIMESTAMPTZ | 수집 시각 |

## 7. 제목 파싱 로직 (`TitleParserService`)

순수 함수로 구현하며 TDD의 핵심 대상이다.

1. 제목 앞 대괄호 추출: `^\[([^\]]+)\]`. 이중 대괄호(`[A][B]`)와 선행 괄호(`(...)`)도 처리.
2. 추출 텍스트를 **비게임 블록리스트**와 대조:
   - 일반어: `신규 프로젝트`, `프로젝트`, `차기작`, `신작`
   - 장르: `MMORPG`, `RPG`, `FPS`, `캐주얼`, `방치형`, `서브컬처` 등
   - 플랫폼/지역/고용형태: `모바일`, `PC`, `콘솔`, `서울`, `부산`, `경기`, `대구`,
     `인턴`, `정규직`, `계약직`, `신입`, `경력` 등
   - 회사/조직 접미사: `스튜디오`, `게임센터`, `게임즈`, `소프트`, `컴퍼니`, `엔터테인먼트`
3. 블록리스트 매칭 또는 대괄호 없음 → `imageQueryType='company'`,
   `imageQuery=회사명`, `gameTitle=null`
4. 그 외 → `imageQueryType='game'`, `imageQuery=대괄호텍스트 + " 게임"`,
   `gameTitle=대괄호텍스트`

### 검증 예시 (단위 테스트 케이스)

| 제목 | 추출 | 분류 | 검색어 |
|---|---|---|---|
| `[p.일렌시아] 배경 도트 디자이너` | `p.일렌시아` | game | `p.일렌시아 게임` |
| `[던파모바일2D] 2D 도트 아바타 디자이너` | `던파모바일2D` | game | `던파모바일2D 게임` |
| `[신규 프로젝트] 캐릭터/배경 원화가` | `신규 프로젝트` | company | (회사명) |
| `[프론티어 스튜디오][MMORPG] 캐릭터 원화가` | `프론티어 스튜디오` | company | (회사명) |
| `[111퍼센트] 3D 게임 그래픽 디자이너` | `111퍼센트` | company | (회사명) |
| `(프리랜서·외주 포함) 캐릭터 원화 디자이너` | (대괄호 없음) | company | (회사명) |

## 8. API 명세

### `GET /api/jobs?page=N`

응답:
```json
{
  "page": 1,
  "totalPages": 7,
  "jobs": [
    {
      "id": "278454",
      "company": "(주)원더소프트",
      "companyUrl": "https://www.gamejob.co.kr/Company/Detail?M=...",
      "title": "[경북글로벌게임센터] 원더킹, 세피루스 2D 원화및 도트 구인",
      "detailUrl": "https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454",
      "deadline": "상시",
      "registeredAt": "2026-05-22T05:00:00Z",
      "tags": ["신입", "학력무관", "경북 > 경산시", "온라인PC게임", "정규직"],
      "gameTitle": null,
      "imageQuery": "(주)원더소프트",
      "imageQueryType": "company"
    }
  ]
}
```

### `GET /api/game-image?q=<검색어>&type=game|company`

응답:
```json
{ "query": "p.일렌시아 게임", "imageUrl": "https://...", "status": "found" }
```

`status`는 `found` | `not_found` | `error`.

## 9. 에러 처리

| 상황 | 처리 |
|---|---|
| 게임잡 스크래핑 실패 (네트워크/구조 변경) | API가 502 + 명확한 메시지 반환. 파싱 결과 0건이면 "구조 변경"으로 간주해 에러 처리 — 빈 목록을 조용히 반환하지 않는다 |
| 웹에서 목록 로드 실패 | 에러 상태 + 재시도 버튼 표시 |
| 네이버 이미지 스크래핑 실패 | `game_images.status='error'` 저장, 카드는 플레이스홀더. 목록 렌더는 절대 막지 않는다 |
| 이미지 검색 결과 없음 | `status='not_found'` 저장 → 불필요한 재스크래핑 방지 |
| 네이버 차단/과부하 방지 | 이미지 스크래핑 동시성 제한(3~5), 현실적인 User-Agent 헤더, DB 캐시로 재요청 최소화 |

## 10. 테스트 전략 (TDD)

- `TitleParserService` — 순수 함수, 7절 검증 예시 + 추가 케이스로 단위 테스트 (최우선)
- `GamejobScraperService` — 실제 HTML을 1회 받아 픽스처로 저장 → 픽스처 파싱 테스트.
  테스트는 네트워크를 사용하지 않는다
- `GameImageService` — 네이버 검색결과 HTML 픽스처로 파서 테스트
- `registeredAt` 상대시간 변환("N시간 전"/"N일 전" → 절대시각) 단위 테스트
- `web` — 공고 카드의 3상태(로딩/이미지/플레이스홀더) 컴포넌트 테스트

## 11. 배포

- **로컬**: `apps/api`는 `nest start`, `apps/web`은 `next dev`. DB는 Vercel
  Postgres(Neon)에 직접 접속 (또는 Docker 로컬 Postgres)
- **Vercel**: `web`은 네이티브 배포. `api`(NestJS)는 서버리스 함수로 래핑해 별도
  Vercel 프로젝트로 배포
- 환경변수: `DATABASE_URL`, API 베이스 URL
- 스키마는 Prisma 마이그레이션으로 관리

## 12. 미해결 과제 (구현 1단계에서 확정)

1. **원화 직종 필터의 정확한 요청 파라미터** — 게임잡 상세검색이 POST 폼/JS
   기반이므로, 브라우저 네트워크 탭으로 실제 요청(URL · 파라미터 · `등록일순`
   정렬값 · `40개씩` 값)을 확인한다
2. **목록 partial 엔드포인트** `/recruit/_GI_Job_List` 활용 가능 여부 검증
3. **네이버 이미지 검색 URL · HTML 구조** 확인. 봇 차단 시 폴백(구글 이미지 등)

## 13. 리스크

- 스크래핑 취약성(게임잡·네이버 양쪽 HTML 변경) → 픽스처 + 격리된 파서 + 명확한
  에러로 완화
- 네이버 봇 차단 가능성 → 동시성 제한 · DB 캐시 · 폴백 소스로 완화
- 스크래핑은 개인/로컬 용도 전제. 저부하 · 캐시로 예의 있게 운용
