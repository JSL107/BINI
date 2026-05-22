# 스크래핑 노트

> 조사 방법: 헤드리스 Chromium(Playwright)으로 gamejob.co.kr의 원화 상세검색을
> 실제로 구동하여 네트워크 요청을 캡처한 뒤, plain Node `fetch`로 재현 검증함.
> 이 문서의 모든 값은 **관찰된 사실**이며, 추측은 명시적으로 표기함.
> 캡처 픽스처: `apps/api/test/fixtures/gamejob-wonhwa-list.html` (40개 공고, 등록일순).

## 게임잡 원화 목록 요청

- **원화 직종**: `groupCode/subCode` = `1 / 5`
  - groupCode 1 = 게임제작, subCode 5 = 원화 (현재 공고 266건)
  - 페이지 내 직종 taxonomy JSON: `{"subCode":5,"subName":"원화","giCnt":266,"groupCode":1}`
  - 검색 요청에는 `condition[duty]=5` 만 사용된다 (groupCode는 UI 트리 표시용일 뿐
    요청 본문에 포함되지 않음 — 캡처된 모든 요청 본문에서 확인).

- **검색 적용 방식**: 상세검색 UI는 폼 제출이 아니라 **AJAX POST**로 목록을 가져온다.
  - 엔드포인트: `POST https://www.gamejob.co.kr/Recruit/_GI_Job_List/`
    (URL 끝의 슬래시 포함. `adminParam`이 비어있어 쿼리스트링은 없음)
  - Content-Type: `application/x-www-form-urlencoded; charset=UTF-8`
  - 요청 본문(application/x-www-form-urlencoded), 원화 1페이지 등록일순 40개씩 기준:
    ```
    condition[duty]=5
    condition[menucode]=        (빈 값 — 신규검색 시 menucode는 비워서 보냄)
    condition[tabcode]=1
    page=1
    direct=0                    (즉시지원만 보기 = 0)
    order=3                     (정렬, 아래 참조)
    pagesize=40                 (페이지 크기)
    tabcode=1                   (기업유형 탭: 1=전체)
    ```
  - 헤더: `X-Requested-With: XMLHttpRequest` 권장. `Referer`/`Origin`은 없어도 동작함.
  - **쿠키 불필요** — 검증 결과 쿠키 없이도 동일한 원화 목록을 반환함(아래 재현 항목 참조).
  - 응답: 목록 HTML 조각(`<table class="tblList">` 포함, status 200, 약 90~107KB).
  - 참고: UI는 검색 버튼(`#dev-btn-cnt`, "선택된 N건 검색") 클릭 시 부수적으로
    `POST /Recruit/_SearchCount/` (건수 조회)와 `POST /Recruit/setSearchConditionSave`
    (검색조건 세션 저장)도 호출하지만, 목록 데이터 자체는 `_GI_Job_List`가 만든다.
    스크래퍼는 `_GI_Job_List`만 호출하면 된다.

- **등록일순 정렬 파라미터**: `order=3`
  - 관찰된 전체 매핑(`select[name=orderTab]` option 값):
    `1=추천순`, `2=경력순`, `3=등록일순`, `4=수정일순`, `5=마감일순`
  - 검증: `order=1`과 `order=3`은 명확히 다른 정렬 결과를 반환함(첫 GI_No 상이).

- **40개씩(페이지 크기) 파라미터**: `pagesize=40`
  - 관찰된 매핑(`select[name=psTab]` option 값): `20=20개씩`, `40=40개씩`
  - `pagesize=40`일 때 한 페이지에 정확히 40개 공고 행이 반환됨(픽스처에서 확인).

- **페이지네이션**: `/recruit/_GI_Job_List?Page=N` — **이 GET 엔드포인트는 쓰지 말 것.**
  - GET `?Page=N`은 세션 쿠키에 저장된 검색조건에 의존하는데, 검증 결과
    검색 POST 직후라도 GET `?Page=2`는 **원화 필터가 적용되지 않은 기본 목록**을
    돌려줬다(40개 중 11개만 그래픽 직군, 나머지는 재무·총무 등 무관 공고).
  - **대신 POST `_GI_Job_List`의 본문 `page` 값을 N으로 바꿔 호출하면**
    원화로 필터된 N페이지가 정확히 반환된다(쿠키 불필요, 완전 무상태).
    검증: page=1/2/3/7 각각 호출 → 모두 200, 원화 직군 비율 70~90%, 행 중복 없음.

- **스크래퍼가 plain fetch+쿠키로 재현 가능한가**: **예 — 쿠키조차 불필요.**
  - 확정된 recipe (Node `fetch` 그대로 사용 가능):
    1. (선택) `GET /Recruit/joblist?menucode=duty` 로 워밍업 — 없어도 동작 확인됨.
    2. 각 페이지마다 `POST /Recruit/_GI_Job_List/` 호출:
       - 헤더: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`,
         `X-Requested-With: XMLHttpRequest`, 현실적인 `User-Agent`
       - 본문: `condition[duty]=5&condition[menucode]=&condition[tabcode]=1`
         `&page=<N>&direct=0&order=3&pagesize=40&tabcode=1`
    3. 응답 HTML 조각을 파싱(`<table class="tblList"> > tbody > tr`).
    4. `page`를 1..총페이지수로 증가시키며 반복.
  - 헤드리스 브라우저는 **불필요**. 권장: Playwright 없이 plain `fetch` + 위 POST recipe.
    (헤드리스는 최초 조사·검증용으로만 사용했고, 운영 스크래퍼에는 필요 없음.)

- **총 페이지 수 확인 위치**: 응답 HTML의 `<div class="pagination"> > <div class="inner">`
  - 현재 페이지: `<span class="btn now">N</span>`
  - 다른 페이지 링크: `<a class="btn" data-page="N" href="/recruit/_GI_Job_List?Page=N">N</a>`
    및 `<a class="btnNext" data-page="N">` / `btnPrev`
  - 전체 공고 수: `<span class="count totalJobcnt">(266)</span>` (목록 상단 탭 영역).
    `pagesize=40`이면 총 페이지 = ceil(266/40) = 7. 마지막(7)페이지는 25개 행.
  - 주의: pagination 블록의 `data-page` 최대값은 현재 보이는 페이지 묶음 기준이라
    실제 마지막 페이지보다 작을 수 있음 → `totalJobcnt / pagesize`로 계산하는 것이 안전.

## 첫 공고 기대값 (Task 8 파서 테스트 정답값)

> 픽스처 `gamejob-wonhwa-list.html`의 `<table class="tblList"> > tbody`의
> **첫 번째 데이터 행**(thead 헤더행 제외). 등록일순(order=3) 정렬 기준.

- **GI_No**: `280518`
- **회사명**: `㈜원더소프트`
- **제목**: `[경북글로벌게임센터] 원더킹, 세피루스 2D 원화및 도트 구인`
- **마감일**: `상시`
- **등록시간 텍스트**: `16시간 전 등록`
- **태그**: `신입`, `학력무관`, `경북 > 경산시`, `온라인PC게임, 모바일게임`, `정규직, 계약직`

> 참고: 등록일순은 시간이 지나면 새 공고가 위로 올라오므로 첫 행이 바뀐다.
> 이 값들은 캡처 시점(2026-05-22) 픽스처 파일 기준 고정값이다. Task 8 파서
> 테스트는 동적 사이트가 아니라 **저장된 픽스처 파일**을 입력으로 써야 한다.

## 공고 행 HTML 구조

- **목록 컨테이너**: `<div id="dev-gi-list">` → `<table class="tblList">`
- **각 공고 행을 감싸는 요소**: `table.tblList > tbody > tr`
  - `thead > tr`(기업명/공고제목/마감일 헤더)는 제외할 것.
  - 한 페이지에 `pagesize`개의 `tbody > tr`가 있음(40개씩이면 40행, 마지막 페이지는 그 이하).
- **회사명**: `td:nth-child(1) div.company > a[href^="/Company/Detail"] > strong` 의 텍스트
  - 회사 상세 링크: 같은 `a`의 `href` (예: `/Company/Detail?tabcode=1&M=46312306`)
  - 로고 없는 회사는 `div.company.noLogo`. (캡처된 40행은 전부 noLogo)
- **제목**: `td:nth-child(2) div.tit > a[href^="/Recruit/GI_Read/View"] > strong` 의 텍스트
  - 공고 상세 링크 / GI_No: 같은 `a`의 `href` (`/Recruit/GI_Read/View?GI_No=280518`)
    — `GI_No=` 뒤 숫자를 정규식으로 추출.
  - `a`와 같은 `div.tit` 안의 `button.btnScrap`에는 `id="btnScrap_<GI_No>"` 및
    `data-value="<GI_No>|<회사slug>|<GI_No>"`가 있어 GI_No 교차검증 가능.
- **마감일**: `td:nth-child(3) span.date` 의 텍스트
  - 관찰된 값: `상시`, `채용시`, `~06/07`, `~05/31` 등 (`~MM/DD` 또는 상시/채용시).
- **등록시간**: `td:nth-child(3) span.modifyDate` 의 텍스트
  - 관찰된 값: `16시간 전 등록`, `1일 전 등록` 등 상대시간 문자열.
- **태그**: `td:nth-child(2) div.tit > p.info > span` (여러 개)
  - 순서: 경력(신입/경력 등) / 학력 / 근무지역 / 게임플랫폼 / 고용형태.
  - 행마다 span 개수가 다를 수 있으니 인덱스 고정 대신 전체 span 텍스트를 수집할 것.

## 캡처 메타

- 캡처 일시: 2026-05-22
- 캡처된 _GI_Job_List 요청(원화 1페이지, 등록일순, 40개씩) 실제 본문:
  `isDefault=true&condition[duty]=5&condition[menucode]=&condition[tabcode]=1&page=1&direct=0&order=1&pagesize=40&tabcode=1`
  (UI 최초 검색은 `isDefault=true`로 order를 강제로 1=추천순으로 보냄. 그 직후
  등록일순 정렬 클릭으로 `order=3` 재요청이 발생함. 스크래퍼는 `isDefault` 없이
  처음부터 `order=3`으로 호출하면 됨 — 검증 완료.)
- 확정 vs 불확실:
  - 확정: 엔드포인트, 본문 파라미터(`condition[duty]`,`page`,`order`,`pagesize`,
    `tabcode`,`direct`), order/pagesize 매핑, 쿠키 불필요, POST 페이지네이션, 행 구조.
  - 불확실: `condition[tabcode]`와 최상위 `tabcode`의 정확한 차이(둘 다 1=전체로 관찰).
    `direct`는 즉시지원 필터(0=전체)로 추정 — 0 외 값은 테스트하지 않음.
