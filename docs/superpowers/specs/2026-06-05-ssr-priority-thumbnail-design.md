# SSR Priority 카드 썸네일 — Speed Index 개선 설계

- 작성일: 2026-06-05
- 대상: `apps/web` (Next.js 16) + `apps/api` (NestJS) + `packages/types`
- 목표: 홈(`/`) 잡 목록의 **Speed Index 6.4초 → 개선**. Performance 점수 손실의 대부분(SI -6)을 차지하는 병목 제거.

## 1. 배경 / 문제

홈은 PageSpeed Insights(모바일, Slow 4G) 기준 **Performance 90 / 접근성 92 / 권장사항 96 / SEO 100**으로 이미 건강하다. 단, 점수 손실이 두 곳에 집중:

- **Speed Index 6.4초 (-6)** ← 본 설계의 대상
- CLS 0.117 (-4) ← 별도 작업

FCP 1.0초·LCP 1.8초로 텍스트는 빠르게 뜨지만 SI만 유독 느린 모순의 원인은:

**카드 이미지가 SSR 페이로드에 없고, hydration 후 클라이언트가 직렬 체인으로 가져온다.**

```
[JS 번들 다운로드·파싱·hydration]
   → fetchJobImages(jobId)        // 1차 API 왕복
   → (비면) fetchGameImage(...)   // 2차 API 왕복
   → next/image가 /_next/image    // 3차: Vercel 변환·다운로드
```

`JobImageCarousel`은 `useState({ kind: 'loading' })`로 시작하므로 **priority 카드(idx<3)조차 SSR HTML엔 회색 skeleton(`h-48 animate-pulse`)만** 들어간다. 화면 대부분을 차지하는 이미지 그리드의 시각적 완성이 늦어 SI가 치솟는다.

### 왜 이미지가 `/jobs`와 분리됐는가 (보존해야 할 제약)

`JobImagesService.doResolve()`는 무겁다:
- 첫 요청 시 외부 사이트 **실시간 스크래핑**(`fetchDetail`)
- 대표게임마다 **Naver 이미지 검색 API 호출**
- bad-image **DB 필터링**

잡 1건당 수백ms~수초. 40개 카드에 대해 `/jobs` 응답에서 동기로 하면 Vercel 타임아웃 + FCP까지 붕괴. **분리는 올바른 결정이며, 본 설계는 이 무거운 경로를 건드리지 않는다.**

### 활용할 통찰

무거운 연산은 enrichment 캐시를 **채울 때**만 발생한다. 이미 채워진 잡은 결과가 DB/캐시에 그대로 있다:
- `job.bodyImages` — 회사가 본문에 올린 이미지. `combineImages` 신뢰도 1순위. **Job row에 저장됨 (조회 0)**
- `namuwiki_images` 테이블 — 대표게임 대표 이미지 캐시
- `game_images` 테이블 — Naver 검색 결과 캐시

→ **외부 호출 0번으로** priority 카드의 대표 이미지 1장을 뽑아 SSR HTML에 박을 수 있다.

## 2. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 적용 범위 | **첫 페이지(`page===1`)의 priority 카드 3개만**. 그 외 카드·페이지는 기존 동작 |
| 이미지 소스 | **bodyImages + DB 캐시(namuwiki + game_images)** — `combineImages` 우선순위를 캐시 조회로 재현 |
| 외부 호출 | **0번** — 캐시/row lookup만. 미스 시 썸네일 없이 폴백 |
| 기능 보존 | **progressive enhancement** — 기존 carousel/모달/신고 100% 유지 |
| 구현 방식 | Approach A: `getJobsFromDb`가 `thumbnailUrl`을 DTO에 주입 (추가 네트워크 왕복 0) |

## 3. 아키텍처

### 3-1. 서버 — `thumbnailUrl` resolve (외부 호출 0)

새 read-only 헬퍼 `resolveCachedThumbnails(rows)`. `combineImages`의 신뢰도 순위를 **캐시/row 조회만으로** 재현해 각 잡의 **첫 1장**만 뽑는다:

```
우선순위 (첫 hit에서 중단):
  1) row.bodyImages[0]                              ← Job row (조회 0)
  2) namuwiki.lookupMany(representativeGames)[0]    ← namuwiki_images IN 1회
  3) game_images 캐시 hit                            ← game_images IN 1회
       검색어: resolveRepImage 합성과 동일
         "<게임명> <회사명> 게임", "<게임명> 게임"
  4) game_images[imageQuery] (bracket)              ← 위 IN에 포함
그 후: badImage.findBlocked(후보 union) 로 신고 이미지 제거  ← 1회
```

- **범위 게이트:** `page === 1`의 첫 3개 row에만 resolve. 그 외 `thumbnailUrl = null`.
- **`images.service.resolve`는 사용하지 않는다** (캐시 미스 시 외부 호출하므로). 순수 lookup만 사용:
  - `prisma.gameImage.findMany({ where: { query: { in }, status: 'found', imageUrl: { not: null } } })`
  - `namuwiki.lookupMany(...)` (이미 read-only 캐시 조회)
  - `badImage.findBlocked(...)`
- 추가 쿼리 총합: priority 3개에 대해 **최대 3쿼리(namuwiki IN + game_images IN + bad-image IN), 외부 호출 0**.
- **신뢰성 우선:** resolve 전체를 try/catch로 감싸 어떤 예외든 해당 카드 `null` 폴백. `/jobs` 응답은 절대 깨지지 않는다.

### 3-2. 타입 — `packages/types`

`Job`에 필드 추가:

```ts
/**
 * 서버가 외부 호출 없이 즉시 알 수 있는 대표 이미지 1장 (SSR 시드용).
 * page===1의 priority 카드(첫 3개)에만 채워지고, 그 외에는 항상 null.
 */
thumbnailUrl: string | null;
```

`toJobDto`에 매핑 추가 (기본 `null`, caller가 주입).

### 3-3. 클라이언트 — progressive enhancement

`JobImageCarousel`에 `initialThumbnail?: string` prop 추가:

- 초기 state 시드:
  ```ts
  useState<State>(
    initialThumbnail
      ? { kind: 'ready', urls: [initialThumbnail], index: 0,
          gameImages: [initialThumbnail], companyPhotos: [] }
      : { kind: 'loading' }
  )
  ```
- → **SSR HTML에 priority 카드의 실제 `<img>`(next/image, fill, priority)가 박힌다.** FCP 시점에 이미지가 보임.
- hydration 후: priority 카드는 기존대로 `fetchJobImages`를 계속 호출 → 다중 이미지·모달·신고 데이터로 carousel을 보강 교체.
- `JobCard`는 `job.thumbnailUrl`을 `initialThumbnail`로 전달.

### 3-4. 데이터 흐름 비교

```
기존:  SSR(회색 skeleton) → hydration → fetchJobImages → (폴백)fetchGameImage → /_next/image
개선:  SSR(<img> 박힘, priority 3개) → [이미 보임] → hydration 후 백그라운드로 carousel 보강
```

## 4. 에러 처리 / 엣지 케이스

- **회귀 가드 (핵심):** hydration 후 `fetchJobImages`가 **빈 결과·에러**를 반환하면 `initialThumbnail`을 **유지**한다. placeholder로 떨어뜨려 SSR 이미지를 날리지 않는다 (깜빡임/CLS 방지). 즉 시드된 carousel은 "fetch가 더 나은 결과를 줄 때만" 교체.
- 컨테이너는 그대로 `h-48` 고정 → 썸네일 유무와 무관하게 CLS 영향 없음 (오히려 skeleton↔image 깜빡임 감소).
- bodyImages·캐시 전부 미스인 priority 카드 → `thumbnailUrl = null` → 기존 skeleton→fetch 경로 (graceful degradation).
- thumbnail로 쓴 URL이 hydration 후 fetch 결과에 없으면(드묾) carousel 첫 프레임만 교체될 뿐 기능 영향 없음.

## 5. 테스트 / 검증

### 단위 테스트
- 서버 `resolveCachedThumbnails`:
  - 우선순위 분기 (bodyImages > namuwiki > game_images > bracket)
  - bad-image 필터로 신고 URL 제거
  - 캐시 전부 미스 → `null`
  - **외부 호출이 일어나지 않음** (images.service.resolve 미호출) 보장
  - `page !== 1` 또는 idx>=3 → `null`
- 클라 `JobImageCarousel.test.tsx`:
  - `initialThumbnail` 시드 시 첫 렌더에 `<img>` 존재 (skeleton 아님)
  - **fetch 빈 결과·에러 시 썸네일 유지** 회귀 가드
  - 기존 carousel/모달/신고 케이스 유지

### E2E 검증
1. 변경 후 `curl https://<deploy>/ | grep '_next/image'` → priority 카드 `<img src>` 존재 확인
2. Lighthouse(PageSpeed Insights 또는 포그라운드 로컬)로 SI 재측정 → 6.4초 대비 개선 확인
3. priority 외 카드/2페이지는 기존 동작(skeleton→fetch) 회귀 없음 확인

## 6. 범위 밖 (Non-goals)

- CLS 0.117 개선 (별도 작업)
- 접근성(대비/터치 타겟), 권장사항(콘솔 에러)
- 이미지 enrichment 파이프라인(`JobImagesService`) 변경
- priority 카드를 4개 이상으로 늘리거나 전체 카드 SSR화
- `/jobs` 응답에 다중 이미지/carousel 데이터 포함

## 7. 영향 범위 요약

| 파일 | 변경 |
|---|---|
| `packages/types/src/index.ts` | `Job.thumbnailUrl` 추가 |
| `apps/api/src/jobs/job-dto.ts` | `toJobDto`에 thumbnailUrl 매핑 |
| `apps/api/src/jobs/jobs-cron.service.ts` | `getJobsFromDb`에서 priority 3개 thumbnail 주입 |
| `apps/api/src/images/` (신규 헬퍼/메서드) | `resolveCachedThumbnails` (DB-only) |
| `apps/web/src/components/JobImageCarousel.tsx` | `initialThumbnail` prop + state 시드 + 회귀 가드 |
| `apps/web/src/components/JobCard.tsx` | `job.thumbnailUrl` 전달 |
| 관련 `*.test.ts(x)` | 단위 테스트 추가 |
