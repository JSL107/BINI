# 배포 가이드 (Vercel)

BINI는 Vercel 프로젝트 **두 개**로 배포한다: NestJS API와 Next.js Web. 각각의 Root Directory를 `apps/api` / `apps/web`로 지정한다.

## 사전 준비

1. **Postgres**: Vercel Postgres (Neon) 프로젝트 생성 → 풀링된(pooled) 연결 문자열 확보.
   - ⚠️ 서버리스 함수마다 풀이 생기므로 **direct 연결**이 아닌 **pooler** 엔드포인트의 URL을 `DATABASE_URL`로 쓴다 (예: Neon 콘솔의 `Pooled connection`).
2. **GitHub 리포지토리**에 푸시.

## 1) API 프로젝트 (`apps/api`)

| 항목 | 값 |
|---|---|
| Framework | Other |
| Root Directory | `apps/api` |
| Build Command | (vercel.json 사용 — 자동) |
| Output Directory | (기본) |

**환경변수:**
- `DATABASE_URL` = Vercel Postgres pooled 연결 문자열
- `WEB_ORIGIN` = 배포된 Web 도메인 (예: `https://bini-web.vercel.app`)

`apps/api/vercel.json`의 `buildCommand`가 다음을 차례로 실행:
1. `@bini/types` 빌드
2. `prisma generate` (드라이버 어댑터 기반 클라이언트 생성)
3. `prisma migrate deploy` (스키마 적용)
4. `nest build`

`apps/api/api/index.ts`가 서버리스 함수 진입점. `vercel.json`의 `rewrites`가 `/api/*`를 이 함수로 보낸다. NestJS의 `setGlobalPrefix('api')` 덕에 함수 내부에서 `/api/jobs` 등이 그대로 매칭된다.

## 2) Web 프로젝트 (`apps/web`)

| 항목 | 값 |
|---|---|
| Framework | Next.js (자동 감지) |
| Root Directory | `apps/web` |
| Build Command | (vercel.json 사용 — 자동) |
| Install Command | (기본 — pnpm 자동 감지) |

**환경변수:**
- `NEXT_PUBLIC_API_BASE_URL` = `https://<api-domain>/api` (예: `https://bini-api.vercel.app/api`)

## 배포 순서

1. API 프로젝트 먼저 배포 → 도메인 확보 (예: `bini-api.vercel.app`).
2. Web 프로젝트의 `NEXT_PUBLIC_API_BASE_URL`을 API 도메인의 `/api` 경로로 설정 → 배포.
3. API 프로젝트의 `WEB_ORIGIN`을 Web 도메인으로 갱신 → 재배포 (CORS 허용).

## 로컬 검증

배포 전 로컬에서 동일한 빌드 경로를 검증:
```bash
pnpm --filter @bini/types build
pnpm --filter api exec prisma generate
pnpm --filter api build
pnpm --filter web build
```

## 알려진 제약

- 게임잡 스크래핑은 한국 IP에서 더 안정적. Vercel의 글로벌 엣지 리전 일부에서 차단/지연 가능 → 함수 리전을 `icn1`(Seoul)로 고정하는 게 안전 (`vercel.json`에 `"functions": { "api/index.ts": { "regions": ["icn1"] } }` 추가 옵션).
- 네이버 이미지 스크래핑도 동일 — 한국 리전 권장.
- DB 마이그레이션은 매 빌드마다 `migrate deploy`. 신규 마이그레이션이 없으면 no-op.
