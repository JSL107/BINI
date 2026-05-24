import type {
  JobsResponse,
  GameImageResponse,
  ImageQueryType,
  JobImagesResponse,
  CareerSitesResponse,
} from '@bini/types';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export async function fetchJobs(
  page: number,
  search?: string,
): Promise<JobsResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('q', search);
  // 30s 데이터 캐시 — cron이 잡 갱신을 3h 주기로 돌리므로 30s 지연은 안전.
  // 같은 page+search 조합 첫 사용자만 cold path를 타고 그 후 30초 동안은
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
  // 10s 데이터 캐시 — 사용자 신고 후 다른 인스턴스/사용자에게 반영되는
  // 최악 윈도우를 10s로. 신고 인스턴스 자신은 server BadImageService가
  // DB 기반이라 다음 응답부터 즉시 제거.
  const res = await fetch(
    `${BASE}/job-images?id=${encodeURIComponent(jobId)}`,
    { next: { revalidate: 10 } },
  );
  if (!res.ok) throw new Error(`잡 이미지 요청 실패: HTTP ${res.status}`);
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
