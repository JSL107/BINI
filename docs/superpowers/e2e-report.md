# E2E Verification Report (Task 21)

- Date: 2026-05-22T23:45Z
- Web: http://localhost:3001  ·  API: http://localhost:3000  ·  DB: Docker `bini-pg` (port 5433)
- Runner: Playwright (headless Chromium) — `C:\Users\junes\gj-investigation\e2e-verify.js`

## Home page (`/`)

| Item | Value |
|---|---|
| HTTP status | **200** |
| Heading | `게임잡 원화 채용공고` |
| Job cards rendered | **40** |
| First card company | `아트트리(ARTTREE)아카데미학원` |
| First card title | `[전국/온라인]아트트리아카데미 웹툰/일러스트/게임원화 강사 모집` |
| First card detail link | `https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=280563` |
| First card tags | `경력무관`, `학력무관`, `전국, 광주`, `온라인PC게임, 모바일게임`, `정규직, 계약직, 프리랜서` |
| Pagination | **`1 / 7`** (전체 약 266건 / 40씩) |

## Image 3-state breakdown (page 1, after 8s wait)

| Bucket | Count |
|---|---|
| Real image loaded | **23** |
| Placeholder (`data-testid="image-placeholder"`) | **17** |
| Skeleton (still loading) | **0** |
| Sum vs card count | **40 / 40 ✅** |

3-상태 컴포넌트가 의도대로 동작: 카드의 이미지 영역이 (a) 네이버 이미지 로드 성공, (b) 결과 없음/onError → 플레이스홀더, (c) 8초 내 모두 해결(스켈레톤 0)로 안정적으로 수렴.

## Pagination (`1 → 2`)

| Item | Value |
|---|---|
| URL after clicking "다음" | `http://localhost:3001/?page=2` |
| Page 2 cards | 40 |
| Page 1 GI_No set ∩ Page 2 GI_No set | **∅ (overlap 0)** |
| Sample page 1 GI_No | `280563, 279952, 280553, 280410, 280540` |

페이지 간 공고가 완벽히 분리됨 — `등록일순` 정렬 + DB `where: { id: { in: ids } }` 조회 로직이 의도대로 동작.

## Error boundary (`/?page=999999`)

| Item | Value |
|---|---|
| "다시 시도" 버튼 존재 | **yes** |
| 본문 텍스트 | `공고를 불러오지 못했습니다.다시 시도` |

존재하지 않는 페이지를 강제로 요청해 API 502/오류를 유발 → `error.tsx`(Next.js 16 `unstable_retry`) 정상 표시.

## Screenshots

- `C:\Users\junes\gj-investigation\e2e-screenshots\home.png` (page 1, 풀 페이지)
- `C:\Users\junes\gj-investigation\e2e-screenshots\page2.png` (page 2, 풀 페이지)

리포 외부에 저장되어 커밋되지 않음 (스크린샷은 로컬 검증 산출물).

## Verdict

**✅ PASS**

체크 항목 8/8 통과, 캡처된 에러 0건. 게임잡 원화 공고 269건이 등록일순으로 7페이지에 걸쳐 안정적으로 렌더되며, 이미지 3-상태 + 페이지네이션 + 에러 바운더리가 모두 사양대로 동작.

## 후속 / 향후

- 사용자 요청으로 진행 중인 추가 기능(상세페이지 이미지 폴백 + 대표게임 카루셀 + 회사 로고 아바타)이 머지되면 본 검증을 재실행해 추가 슬라이드·로고 표시까지 확인 필요.
- Vercel 배포 후엔 production URL에 대해 같은 스크립트(WEB 상수만 교체)로 회귀 검증 가능.
