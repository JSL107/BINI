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
  const res = await fetch(`${BASE}/jobs?${params.toString()}`, { cache: 'no-store' });
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

export async function fetchJobImages(jobId: string): Promise<JobImagesResponse> {
  const res = await fetch(
    `${BASE}/job-images?id=${encodeURIComponent(jobId)}`,
    { cache: 'no-store' },
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
