import type {
  JobsResponse,
  GameImageResponse,
  ImageQueryType,
  JobImagesResponse,
  CareerSitesResponse,
  CompanyDetailResponse,
  JobsSort,
  CalendarResponse,
  NewSinceResponse,
} from '@bini/types';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export interface JobsQueryOptions {
  search?: string;
  /** 다중 OR. CSV로 직렬화되어 ?experience= 에 전달. */
  experience?: string[];
  /** 다중 OR. CSV로 직렬화되어 ?employmentType= 에 전달. */
  employmentType?: string[];
  /** 다중 OR. 시도 라벨 (예: ['서울','경기']). hasSome 의미. */
  location?: string[];
  /** true일 때만 isRemote=true 필터. false/undefined는 무필터. */
  remote?: boolean;
  /** 정렬. 미지정 시 서버 기본('recent'). */
  sort?: JobsSort;
}

export async function fetchJobs(
  page: number,
  opts: JobsQueryOptions = {},
): Promise<JobsResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (opts.search) params.set('q', opts.search);
  if (opts.experience && opts.experience.length > 0) {
    params.set('experience', opts.experience.join(','));
  }
  if (opts.employmentType && opts.employmentType.length > 0) {
    params.set('employmentType', opts.employmentType.join(','));
  }
  if (opts.location && opts.location.length > 0) {
    params.set('location', opts.location.join(','));
  }
  if (opts.remote === true) params.set('remote', 'true');
  // recent는 기본값이라 굳이 전송하지 않음 — URL 깔끔하게 유지.
  if (opts.sort && opts.sort !== 'recent') params.set('sort', opts.sort);
  // 30s 데이터 캐시 — cron이 잡 갱신을 3h 주기로 돌리므로 30s 지연은 안전.
  // 같은 page+필터 조합 첫 사용자만 cold path를 타고 그 후 30초 동안은
  // Vercel Edge가 즉시 응답.
  const res = await fetch(`${BASE}/jobs?${params.toString()}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`공고 목록 요청 실패: HTTP ${res.status}`);
  return res.json();
}

export async function fetchGameImage(
  query: string,
  type: ImageQueryType,
): Promise<GameImageResponse> {
  const url = `${BASE}/game-image?q=${encodeURIComponent(query)}&type=${type}`;
  // 5분 데이터 캐시 — game_images 캐시 자체가 14일 보존이라 5분 지연 무관.
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`이미지 요청 실패: HTTP ${res.status}`);
  return res.json();
}

export async function fetchJobImages(jobId: string): Promise<JobImagesResponse> {
  // 10s 데이터 캐시 — 사용자가 잘못된 이미지 신고 후 새로고침해도 같은 잡 응답이
  // Edge cache hit으로 그대로 보이던 문제 단축. server 측 BadImageService 메모리
  // 캐시는 같은 instance라면 즉시 차단되므로 Edge cache 10s만 지나면 반영됨.
  const res = await fetch(
    `${BASE}/job-images?id=${encodeURIComponent(jobId)}`,
    { next: { revalidate: 10 } },
  );
  if (!res.ok) throw new Error(`잡 이미지 요청 실패: HTTP ${res.status}`);
  return res.json();
}

/**
 * 회사명으로 BINI 통합 잡 + 회사 메타데이터 조회. 404일 경우 null 반환
 * (Next.js의 notFound() 트리거에 사용).
 *
 * 30s revalidate — 회사 잡 변화가 cron(3h) 단위라 30s는 안전, Edge 캐시도 활용.
 */
export async function fetchCompanyByName(
  name: string,
): Promise<CompanyDetailResponse | null> {
  const url = `${BASE}/companies/by-name?q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`회사 조회 실패: HTTP ${res.status}`);
  return res.json();
}

export async function getCareerSites(): Promise<CareerSitesResponse> {
  const res = await fetch(`${BASE}/companies/career-sites`, {
    next: { revalidate: 3600 }, // 1h ISR cache
  });
  if (!res.ok) throw new Error(`Failed to fetch career sites: HTTP ${res.status}`);
  return res.json();
}

/**
 * "이 이미지 잘못됐어요" 신고. fire-and-forget — 실패해도 클라이언트 상태는
 * 이미 optimistic하게 제거된 상태라 UX 흐름엔 영향 없음. 네트워크 실패 로그만 남김.
 */
export async function reportBadImage(
  imageUrl: string,
  jobId?: string,
  reason?: string,
): Promise<void> {
  try {
    const res = await fetch(`${BASE}/job-images/report-bad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, jobId, reason }),
    });
    if (!res.ok && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`bad-image report HTTP ${res.status}`);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('bad-image report error', err);
    }
  }
}

/**
 * 캘린더 페이지가 사용. 오늘(KST) 부터 weeks주(기본 4)의 일자별 신규/마감 카운트.
 * cron 갱신 주기 3h라 60s revalidate면 충분.
 */
export async function fetchCalendar(weeks: number = 4): Promise<CalendarResponse> {
  const res = await fetch(`${BASE}/jobs/calendar?weeks=${weeks}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`캘린더 요청 실패: HTTP ${res.status}`);
  return res.json();
}

/**
 * since 시각 이후 BINI가 처음 본 잡 수. 홈 헤더의 "지난 방문 이후 신규 N건"
 * 뱃지가 사용한다. since는 ISO 8601 문자열.
 *
 * 클라이언트(브라우저)에서만 호출 — localStorage의 user baseline에 의존하므로
 * cache:'no-store'로 매번 요청. 응답이 작아(숫자 1건) 비용 미미.
 */
export async function fetchNewSinceCount(since: string): Promise<NewSinceResponse> {
  const res = await fetch(`${BASE}/jobs/new-since?since=${encodeURIComponent(since)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`new-since 요청 실패: HTTP ${res.status}`);
  return res.json();
}
