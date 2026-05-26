export type ImageQueryType = 'game' | 'company';
export type ImageStatus = 'found' | 'not_found' | 'error' | 'blocked';
export type JobSource = 'gamejob' | 'wanted' | 'jobkorea' | 'saramin' | 'incruit';

/** cron 시점에 tags+title에서 추출되는 연차 분류. 매칭 안 되면 null. */
export type ExperienceLevel = 'newcomer' | 'junior' | 'mid' | 'senior' | 'any';
/** cron 시점에 tags+title에서 추출되는 고용형태. 매칭 안 되면 null. */
export type EmploymentType =
  | 'fulltime'
  | 'contract'
  | 'parttime'
  | 'freelance'
  | 'intern';

export interface AlternateSource {
  source: JobSource;
  detailUrl: string;
}

export interface Job {
  id: string;
  source: JobSource;
  company: string;
  companyUrl: string;
  title: string;
  detailUrl: string;
  deadline: string;
  /**
   * cron 시점에 `deadline` 텍스트를 파싱한 결과(ISO 8601, UTC). "상시"/"채용시"처럼
   * 날짜로 환산 불가하거나 파싱 실패한 경우 null. 같은 텍스트라도 사이트별 포맷이
   * 들쭉날쭉이라 정확도 100%는 아니지만 정렬·필터·알림의 기준 컬럼으로 사용한다.
   */
  deadlineAt: string | null;
  registeredAt: string; // ISO 8601
  tags: string[];
  gameTitle: string | null;
  imageQuery: string;
  imageQueryType: ImageQueryType;
  alternateSources: AlternateSource[]; // dedup 시 흡수된 다른 소스의 동일 공고들
  /** GameJob 상세페이지에서 lazy 채워지는 회사 로고 URL. 미스크랩이면 null. */
  companyLogoUrl: string | null;
  /** GameJob 상세페이지의 회사 사진들(최대 4장). 미스크랩이면 빈 배열. */
  companyPhotos: string[];
  /** GameJob 상세페이지의 "대표게임" 리스트. 미스크랩이거나 회사가 "-"로 비워두면 빈 배열. */
  representativeGames: string[];
  /** lastSeenAt + 7일이 경과했거나 cron이 명시적으로 만료 처리한 공고. 프론트가 표시 여부 결정. */
  expired: boolean;
  /** tags+title 정규화로 cron이 추출한 연차 분류. 없으면 null. */
  experienceLevel: ExperienceLevel | null;
  /** tags+title 정규화로 cron이 추출한 고용형태. 없으면 null. */
  employmentType: EmploymentType | null;
  /** tags+title에서 추출된 시도 라벨 목록. 다중 가능. */
  locations: string[];
  /** tags+title에 재택/원격 키워드가 있으면 true. */
  isRemote: boolean;
}

export interface JobsResponse {
  page: number;
  totalPages: number;
  jobs: Job[];
  failedSources?: JobSource[]; // 일부 소스 실패 시 메타로 노출
}

/**
 * 잡 목록 정렬 옵션.
 * - 'recent'           : 등록일 desc (기본)
 * - 'deadline-soonest' : 마감 임박순. 'always'/null deadlineAt은 후순위로 밀려나고,
 *                        expired는 제외하지 않되 가장 뒤로 보낸다.
 */
export type JobsSort = 'recent' | 'deadline-soonest';

export interface GameImageResponse {
  query: string;
  imageUrl: string | null;
  status: ImageStatus;
}

/** GET /api/job-images?id=<id> 응답. 상세페이지 enrichment를 한 번에 묶어 반환. */
export interface JobImagesResponse {
  /** 우선순위 순으로 합친 전체 이미지 URL 배열 (카루셀 카드 표면용). */
  images: string[];
  /** 게임 관련 이미지: 대표게임 네이버 검색 결과 + 브래킷 게임 네이버 결과 (모달 "게임" 탭). */
  gameImages: string[];
  /** GameJob 상세페이지의 회사 사진 (모달 "회사" 탭). */
  companyPhotos: string[];
  companyLogoUrl: string | null;
  representativeGames: string[];
}

export type CareerSiteCategory = 'company' | 'jobBoard' | 'companyInfo';

export interface CareerSiteLink {
  name: string;
  url: string;
  category: CareerSiteCategory;
}

export interface CareerSitesResponse {
  sites: CareerSiteLink[];
  source: string; // 'github:GameForPeople/korea-game-career-site'
  fetchedAt: string; // ISO 8601
}

/**
 * 잡플래닛에서 크롤러가 수집한 회사 평판 요약. 회사 페이지에서 우측 카드로 표시.
 * 모든 필드는 옵션 — 크롤러가 못 채웠거나 페이지에 데이터가 없으면 null.
 */
export interface JobplanetSummary {
  /** 잡플래닛 회사 deep link (검색 페이지 X, 회사 페이지 직접) */
  url: string | null;
  /** 0.0–5.0 */
  rating: number | null;
  /** 총 기업리뷰 수 */
  reviewCount: number | null;
  /** 평균연봉 (만원) */
  salaryAvg: number | null;
  /** 마지막 크롤 성공 시각 (ISO 8601) */
  fetchedAt: string | null;
}

/**
 * GET /api/companies/by-name?q=<encoded-company-name> 응답.
 * 한 회사의 BINI 통합 잡 목록 + 회사 메타데이터(로고/사진/대표게임/소스/외부 채용 페이지).
 */
export interface CompanyDetailResponse {
  /** 정규화된 회사명 — query와 같거나 trim/space 정규화 결과 */
  name: string;
  /** 회사 잡 중 첫 비-null logoUrl. detail enrichment 안 된 회사면 null */
  logoUrl: string | null;
  /** 회사 잡들의 companyPhotos 합집합 (dedup) */
  photos: string[];
  /** 회사 잡들의 representativeGames 합집합 (dedup) */
  representativeGames: string[];
  /** 이 회사가 잡을 올린 소스 목록 (unique) */
  sources: JobSource[];
  /** 이 회사의 첫 비-empty companyUrl (외부 채용 페이지) */
  externalCareerUrl: string | null;
  /** 그 회사의 모든 BINI 잡 (만료 포함, 등록일 desc) */
  jobs: Job[];
  /** 잡플래닛 평판 요약. 크롤러가 못 채웠으면 null. */
  jobplanet: JobplanetSummary | null;
}

/** GET /api/stats 응답. 멀티소스 적재·만료·신규 현황을 요약. */
export interface StatsResponse {
  /** DB의 총 공고 수 */
  total: number;
  /** 만료 처리되지 않은 공고 수 (total - expired) */
  active: number;
  /** expiredAt이 set된 공고 수 */
  expired: number;
  /** 최근 24h 내에 firstSeenAt이 찍힌 공고 수 */
  newLast24h: number;
  /** detailScrapedAt이 set된 공고 수 (이미지/회사정보 enrichment 완료) */
  enrichedCount: number;
  /** 0..1 — enrichedCount / total */
  enrichedRatio: number;
  /** 소스별 공고 수 — 모든 JobSource 키가 항상 존재(0이면 0) */
  bySource: Record<JobSource, number>;
  /** 가장 최근 lastSeenAt — cron이 마지막으로 적재한 시각 추정치 */
  lastCronRunAt: string | null;
  /** 응답 생성 시각 */
  generatedAt: string;
  /**
   * 최근 12주 신규 공고 추세. weekStart는 ISO date(월요일 시작 또는 DB date_trunc 결과),
   * count는 해당 주에 firstSeenAt이 찍힌 잡 수. 오름차순(과거→현재).
   */
  weeklyTrend: WeeklyTrendPoint[];
  /** 회사별 누적 공고 top 20. 만료 포함, alias 흡수된 잡(primaryJobId != null)도 모두 카운트. */
  topCompanies: CompanyCount[];
  /**
   * dedup 영속화 후 활성 점유율 — 소스별로 `primaryJobId IS NULL AND expiredAt IS NULL`을
   * 카운트한 값. 모든 JobSource 키가 항상 존재(0이면 0).
   */
  activeBySource: Record<JobSource, number>;
  /**
   * 최근 cron 실행 이력 요약. startedAt desc로 정렬, 기본 20건 상한.
   * 운영 가시성용 — 실패율, 평균 신규 건수, crash 추세 모니터링.
   */
  recentCronRuns: CronRunSummary[];
}

export interface WeeklyTrendPoint {
  /** 주의 시작일(ISO date, 예: "2026-05-18"). DB의 date_trunc('week', firstSeenAt) 결과. */
  weekStart: string;
  count: number;
}

export interface CompanyCount {
  company: string;
  count: number;
}

/**
 * cron 실행 이력 한 행 요약. 운영 대시보드/상태 페이지에서 최근 N건을 표시한다.
 *
 * status:
 *  - 'success'         : 정상 완료
 *  - 'partial_failure' : 일부 소스 실패. 적재는 진행됨.
 *  - 'total_failure'   : 한 페이지에서 모든 소스 동시 실패. 적재 중단.
 *  - 'crashed'         : main 함수가 예외로 종료. errorMessage 참조.
 */
export type CronRunStatus = 'success' | 'partial_failure' | 'total_failure' | 'crashed';

export interface CronRunSummary {
  id: string;
  startedAt: string; // ISO 8601
  finishedAt: string | null;
  status: CronRunStatus;
  pagesProcessed: number;
  scrapedTotal: number;
  dedupedTotal: number;
  newTotal: number;
  expiredSwept: number;
  detailRescrapeAttempted: number;
  detailRescrapeUpdated: number;
  detailRescrapeFailed: number;
  /** 사이클 전체에서 한 번 이상 실패한 소스 합집합. */
  failedSources: string[];
  /** crashed 상태일 때만 의미 있음. 그 외엔 null. */
  errorMessage: string | null;
  /** finishedAt - startedAt(ms). 아직 끝나지 않은 ledger row면 null. */
  durationMs: number | null;
}
