import { Injectable } from '@nestjs/common';
import type { JobImagesResponse } from '@bini/types';
import { NamuwikiImageService } from '../image/namuwiki-image.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';
import { WantedDetailService } from '../scraper/wanted-detail.service';
import { JobkoreaDetailService } from '../scraper/jobkorea-detail.service';
import { IncruitDetailService } from '../scraper/incruit-detail.service';
import type { JobDetailExtract } from '../scraper/gamejob-detail-parser';
import { BadImageService } from './bad-image.service';
import { ImagesService } from './images.service';

interface JobDetailFetcher {
  fetchDetail(sourceId: string): Promise<JobDetailExtract>;
}

const EMPTY: JobImagesResponse = {
  images: [],
  gameImages: [],
  companyPhotos: [],
  companyLogoUrl: null,
  representativeGames: [],
};

@Injectable()
export class JobImagesService {
  private readonly inflight = new Map<string, Promise<JobImagesResponse>>();
  /** lazy enrichment를 지원하는 source → fetcher 매핑. 새 source 추가 시 여기 등록. */
  private readonly detailFetchers: Record<string, JobDetailFetcher>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gamejobDetail: GamejobDetailService,
    private readonly wantedDetail: WantedDetailService,
    private readonly jobkoreaDetail: JobkoreaDetailService,
    private readonly incruitDetail: IncruitDetailService,
    private readonly images: ImagesService,
    private readonly namuwiki: NamuwikiImageService,
    private readonly badImage: BadImageService,
  ) {
    this.detailFetchers = {
      gamejob: this.gamejobDetail,
      wanted: this.wantedDetail,
      jobkorea: this.jobkoreaDetail,
      incruit: this.incruitDetail,
    };
  }

  resolve(rawId: string | undefined): Promise<JobImagesResponse> {
    const id = (rawId ?? '').trim();
    if (!id) return Promise.resolve(EMPTY);

    const existing = this.inflight.get(id);
    if (existing) return existing;

    const promise = this.doResolve(id).finally(() => {
      this.inflight.delete(id);
    });
    this.inflight.set(id, promise);
    return promise;
  }

  private async doResolve(id: string): Promise<JobImagesResponse> {
    let job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return EMPTY;

    // Lazy enrichment — detailFetchers에 등록된 source(gamejob/wanted)만.
    // 그 외 source(jobkorea/saramin/incruit)는 cron이 다른 경로로 채우거나 비어있음.
    const fetcher = this.detailFetchers[job.source];
    if (!job.detailScrapedAt && fetcher) {
      const detail = await fetcher.fetchDetail(job.sourceId || id);
      // Partial update — detail에서 빈 결과로 돌아온 필드는 기존 값을 보존한다.
      // (wanted/jobkorea/incruit/saramin은 representativeGames를 채울 경로가 없어
      // 항상 [] 반환 — 매 rescrape마다 통째 덮어쓰면 다른 경로로 채워진 값 손실.)
      job = await this.prisma.job.update({
        where: { id },
        data: {
          detailScrapedAt: new Date(),
          ...(detail.companyLogoUrl && { companyLogoUrl: detail.companyLogoUrl }),
          ...(detail.companyPhotos.length > 0 && { companyPhotos: detail.companyPhotos }),
          ...(detail.representativeGames.length > 0 && {
            representativeGames: detail.representativeGames,
          }),
          ...(detail.bodyImages.length > 0 && { bodyImages: detail.bodyImages }),
        },
      });
    }

    const { gameImages, companyPhotos, images } = await this.combineImages({
      company: job.company,
      imageQuery: job.imageQuery,
      imageQueryType: job.imageQueryType,
      representativeGames: job.representativeGames,
      companyPhotos: job.companyPhotos,
      bodyImages: job.bodyImages,
    });

    return {
      images,
      gameImages,
      companyPhotos,
      companyLogoUrl: job.companyLogoUrl,
      representativeGames: job.representativeGames,
    };
  }

  /**
   * Carousel image priority:
   *   "게임 관련" 탭 (이 순서로 dedup하며 합침):
   *     1) 공고 본문 iframe — 회사 직접 업로드 키아트/배너 (가장 정확)
   *     2) 나무위키 대표 이미지 — `apps/crawler`가 cron으로 채우는 캐시 (위키 큐레이션)
   *     3) Naver image per 대표게임 — 검색엔진. 회사명 컨텍스트로 동명이인 노이즈 감소
   *     4) Naver image for the bracket-game — 다른 3개 모두 비었을 때만 fallback
   *   "회사 사진" 탭:
   *     - 게임잡 상세페이지의 CoImage/VIew 회사 사진
   *     - 단, 위 게임 탭에 이미 들어간 URL은 회사 탭에서 제거 (cross-tab URL dedup)
   * 카드 표면 카루셀: 두 탭을 그대로 합쳐 dedup (게임 우선).
   *
   * 정합성 강화:
   *   - rep 검색 1차: `<게임명> <회사명> 게임` — 동명이인 게임 (예: "프로젝트 ES")
   *     에 회사 컨텍스트를 더해 노이즈를 줄인다.
   *   - rep 검색 2차: 1차가 0건이면 `<게임명> 게임`으로 폴백 (회사명이 너무 좁힌 경우).
   *   - bracket은 본문/위키/rep 셋 다 비어있을 때만 마지막 fallback — bracket이
   *     코드네임/일반어인 경우 노이즈가 매우 크기 때문.
   */
  private async combineImages(job: {
    company: string;
    imageQuery: string;
    imageQueryType: string;
    representativeGames: string[];
    companyPhotos: string[];
    bodyImages: string[];
  }): Promise<{ gameImages: string[]; companyPhotos: string[]; images: string[] }> {
    // Dedup query strings BEFORE hitting Naver.
    const uniqueGames = Array.from(new Set(job.representativeGames));

    const repPromises = uniqueGames.map((name) =>
      this.resolveRepImage(name, job.company),
    );
    // 나무위키는 read-only 캐시 조회 — 캐시 미스면 빈 배열 (크롤러가 다음 사이클에 채움).
    const namuwikiPromise = this.namuwiki
      .lookupMany(uniqueGames)
      .catch(() => [] as string[]);

    const [repResults, namuwikiImages] = await Promise.all([
      Promise.all(repPromises),
      namuwikiPromise,
    ]);

    const repImages = repResults.filter((u): u is string => !!u);

    // bracket은 lazy — 다른 sources(본문/위키/rep)가 비었을 때만 발화 (정합성 우선).
    let bracketUrl: string | null = null;
    const otherAvailable =
      job.bodyImages.length > 0 || namuwikiImages.length > 0 || repImages.length > 0;
    if (!otherAvailable && job.imageQueryType === 'game' && job.imageQuery.length > 0) {
      bracketUrl = await this.images
        .resolve(job.imageQuery, 'game')
        .then((r) => r.imageUrl)
        .catch(() => null);
    }

    // 신뢰도 가중치 순서:
    //   1) bodyImages — 회사가 공고 본문에 직접 올린 이미지 (검색 매칭 모호성 없음, 가장 정확)
    //   2) 나무위키 대표게임 — 위키에서 큐레이션된 게임 대표 이미지 (검색엔진보다 신뢰)
    //   3) 대표게임 Naver (+ 회사명) — 회사가 명시한 게임명, 회사 컨텍스트로 noise↓
    //   4) 브래킷 게임 Naver — 위 3개 모두 비었을 때만 (코드네임이면 노이즈↑)
    const gameImagesRaw = dedup([
      ...job.bodyImages,
      ...namuwikiImages,
      ...repImages,
      ...(bracketUrl ? [bracketUrl] : []),
    ]);

    // 사용자 신고로 차단된 URL 제거 — DB 기반이라 Vercel multi-instance에서도
    // 일관되게 반영된다 (메모리 Set 캐시였을 때 instance 간 전파 안 되던 회귀 fix).
    const gameImages = await this.badImage.filterUrls(gameImagesRaw);

    // Cross-tab URL dedup: if a body image happened to also be in CoImage/VIew
    // (rare but possible — same blob path), the game tab wins.
    const gameSet = new Set(gameImages);
    const companyPhotos = await this.badImage.filterUrls(
      job.companyPhotos.filter((u) => !gameSet.has(u)),
    );

    const images = dedup([...gameImages, ...companyPhotos]);

    return { gameImages, companyPhotos, images };
  }

  /**
   * 대표게임 한 건의 Naver 이미지 검색.
   *   1차: 회사명 컨텍스트 포함 — "<게임명> <회사명> 게임"
   *   2차: 1차가 0건/실패면 — "<게임명> 게임"
   *
   * 두 시도 모두 verifyText=`<게임명>`을 넘겨, 검색 결과의 출처 페이지
   * `<title>`/`og:title`에 게임명이 포함된 결과만 채택한다 (동명이인 노이즈 컷).
   *
   * 1차는 동명이인 게임(예: "프로젝트 ES" — 매드엔진 vs 던파)의 노이즈를 줄이는
   * 효과가 크고, 2차는 회사명이 너무 좁힌 경우의 커버리지를 보전한다. 두 query
   * 모두 `game_images` 캐시 키가 다르므로 각각 캐시된다.
   */
  private async resolveRepImage(name: string, company: string): Promise<string | null> {
    const cleanCompany = company
      .replace(/[\(\)\[\]"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const primary = cleanCompany ? `${name} ${cleanCompany} 게임` : `${name} 게임`;
    const fallback = `${name} 게임`;

    const r1 = await this.images
      .resolve(primary, 'game', { verifyText: name })
      .catch(() => null);
    if (r1?.imageUrl) return r1.imageUrl;
    if (primary === fallback) return null;

    const r2 = await this.images
      .resolve(fallback, 'game', { verifyText: name })
      .catch(() => null);
    return r2?.imageUrl ?? null;
  }
}

function dedup(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
