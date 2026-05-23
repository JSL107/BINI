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
  constructor(
    private readonly prisma: PrismaService,
    private readonly detail: GamejobDetailService,
    private readonly images: ImagesService,
  ) {}

  async resolve(rawId: string | undefined): Promise<JobImagesResponse> {
    const id = (rawId ?? '').trim();
    if (!id) return EMPTY;

    let job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return EMPTY;

    // Lazy: scrape detail once and persist enrichment fields.
    if (!job.detailScrapedAt) {
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
   * 카루셀 노출용 이미지 우선순위:
   *   1) 대표게임 각각의 네이버 이미지 (사용자가 가장 보고 싶은 "게임 아트")
   *   2) 제목 대괄호가 게임명일 때의 네이버 이미지
   *   3) GameJob 상세페이지의 회사 사진 (모달 확장 보기용)
   * URL 기준 dedup, 순서 보존. 모든 검색은 best-effort — 실패해도 다른 소스로 계속.
   */
  private async combineImages(job: {
    imageQuery: string;
    imageQueryType: string;
    representativeGames: string[];
    companyPhotos: string[];
  }): Promise<string[]> {
    const repPromises = job.representativeGames.map((name) =>
      this.images
        .resolve(`${name} 게임`, 'game')
        .then((r) => r.imageUrl)
        .catch(() => null),
    );
    const repResults = await Promise.all(repPromises);
    const repUrls = repResults.filter((u): u is string => !!u);

    let bracketUrl: string | null = null;
    if (job.imageQueryType === 'game') {
      try {
        const r = await this.images.resolve(job.imageQuery, 'game');
        bracketUrl = r.imageUrl;
      } catch {
        /* best-effort */
      }
    }

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
