import { Injectable } from '@nestjs/common';
import type { JobImagesResponse } from '@bini/types';
import { NamuwikiImageService } from '../image/namuwiki-image.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';
import { ImagesService } from './images.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly detail: GamejobDetailService,
    private readonly images: ImagesService,
    private readonly namuwiki: NamuwikiImageService,
  ) {}

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

    // Lazy enrichment only for sources we can actually scrape (currently gamejob).
    if (!job.detailScrapedAt && job.source === 'gamejob') {
      const detail = await this.detail.fetchDetail(job.sourceId || id);
      job = await this.prisma.job.update({
        where: { id },
        data: {
          companyLogoUrl: detail.companyLogoUrl,
          companyPhotos: detail.companyPhotos,
          representativeGames: detail.representativeGames,
          bodyImages: detail.bodyImages,
          detailScrapedAt: new Date(),
        },
      });
    }

    const { gameImages, companyPhotos, images } = await this.combineImages({
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
   *     3) Naver image per 대표게임 — 검색엔진, 노이즈 가능
   *     4) Naver image for the bracket-game (imageQueryType === 'game')
   *   "회사 사진" 탭:
   *     - 게임잡 상세페이지의 CoImage/VIew 회사 사진
   *     - 단, 위 게임 탭에 이미 들어간 URL은 회사 탭에서 제거 (cross-tab URL dedup)
   * 카드 표면 카루셀: 두 탭을 그대로 합쳐 dedup (게임 우선).
   */
  private async combineImages(job: {
    imageQuery: string;
    imageQueryType: string;
    representativeGames: string[];
    companyPhotos: string[];
    bodyImages: string[];
  }): Promise<{ gameImages: string[]; companyPhotos: string[]; images: string[] }> {
    // Dedup query strings BEFORE hitting Naver.
    const uniqueGames = Array.from(new Set(job.representativeGames));

    const repPromises = uniqueGames.map((name) =>
      this.images
        .resolve(`${name} 게임`, 'game')
        .then((r) => r.imageUrl)
        .catch(() => null),
    );
    const bracketPromise =
      job.imageQueryType === 'game'
        ? this.images
            .resolve(job.imageQuery, 'game')
            .then((r) => r.imageUrl)
            .catch(() => null)
        : Promise.resolve(null);
    // 나무위키는 read-only 캐시 조회 — 캐시 미스면 빈 배열 (크롤러가 다음 사이클에 채움).
    const namuwikiPromise = this.namuwiki
      .lookupMany(uniqueGames)
      .catch(() => [] as string[]);

    const [repResults, bracketUrl, namuwikiImages] = await Promise.all([
      Promise.all(repPromises),
      bracketPromise,
      namuwikiPromise,
    ]);

    // 신뢰도 가중치 순서:
    //   1) bodyImages — 회사가 공고 본문에 직접 올린 이미지 (검색 매칭 모호성 없음, 가장 정확)
    //   2) 나무위키 대표게임 — 위키에서 큐레이션된 게임 대표 이미지 (검색엔진보다 신뢰)
    //   3) 대표게임 Naver — 회사가 명시한 게임명 직접 검색
    //   4) 브래킷 게임 Naver — 제목 첫 대괄호 추출 검색 (코드네임이면 노이즈 가능)
    const gameImages = dedup([
      ...job.bodyImages,
      ...namuwikiImages,
      ...repResults.filter((u): u is string => !!u),
      ...(bracketUrl ? [bracketUrl] : []),
    ]);

    // Cross-tab URL dedup: if a body image happened to also be in CoImage/VIew
    // (rare but possible — same blob path), the game tab wins.
    const gameSet = new Set(gameImages);
    const companyPhotos = job.companyPhotos.filter((u) => !gameSet.has(u));

    const images = dedup([...gameImages, ...companyPhotos]);

    return { gameImages, companyPhotos, images };
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
