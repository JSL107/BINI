import { Injectable } from '@nestjs/common';
import type { JobImagesResponse } from '@bini/types';
import { PrismaService } from '../prisma/prisma.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';
import { ImagesService } from './images.service';

const EMPTY: JobImagesResponse = {
  images: [],
  companyLogoUrl: null,
  representativeGames: [],
};

@Injectable()
export class JobImagesService {
  /**
   * In-flight resolution dedup. When 40 cards on the same page each call
   * `/api/job-images?id=` simultaneously, we share the single in-flight
   * Promise instead of triggering N concurrent detail scrapes (which would
   * thunder GameJob, risk 403s, and permanently poison the cache).
   */
  private readonly inflight = new Map<string, Promise<JobImagesResponse>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly detail: GamejobDetailService,
    private readonly images: ImagesService,
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
    // Other sources keep detailScrapedAt null until a source-specific enricher exists.
    if (!job.detailScrapedAt && job.source === 'gamejob') {
      const detail = await this.detail.fetchDetail(job.sourceId || id);
      job = await this.prisma.job.update({
        where: { id },
        data: {
          companyLogoUrl: detail.companyLogoUrl,
          companyPhotos: detail.companyPhotos,
          representativeGames: detail.representativeGames,
          detailScrapedAt: new Date(),
        },
      });
    }

    const images = await this.combineImages({
      imageQuery: job.imageQuery,
      imageQueryType: job.imageQueryType,
      representativeGames: job.representativeGames,
      companyPhotos: job.companyPhotos,
    });

    return {
      images,
      companyLogoUrl: job.companyLogoUrl,
      representativeGames: job.representativeGames,
    };
  }

  /**
   * Carousel image priority:
   *   1) Naver image per 대표게임 (dedup입력값 + 결과 URL 둘 다 dedup)
   *   2) Naver image for the bracket-game (only when imageQueryType === 'game')
   *   3) GameJob company photos
   * (1) and (2) run in parallel to minimize latency on cold loads.
   */
  private async combineImages(job: {
    imageQuery: string;
    imageQueryType: string;
    representativeGames: string[];
    companyPhotos: string[];
  }): Promise<string[]> {
    // Dedup query strings BEFORE hitting Naver (avoid wasted network round-trips).
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

    const [repResults, bracketUrl] = await Promise.all([
      Promise.all(repPromises),
      bracketPromise,
    ]);

    const repUrls = repResults.filter((u): u is string => !!u);
    const all = [
      ...repUrls,
      ...(bracketUrl ? [bracketUrl] : []),
      ...job.companyPhotos,
    ];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of all) {
      if (!seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
    return out;
  }
}
