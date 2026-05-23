import { Injectable } from '@nestjs/common';
import type { JobImagesResponse } from '@bini/types';
import { PrismaService } from '../prisma/prisma.service';
import { GamejobDetailService } from '../scraper/gamejob-detail.service';

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
  ) {}

  /**
   * 잡 ID로 enrichment를 반환한다.
   * - DB에 detailScrapedAt이 있으면 그 값을 그대로 돌려준다 (캐시 히트).
   * - 미스면 GameJob 상세페이지를 한 번 스크래핑해 Job 행에 persist 후 반환.
   * - 잡이 없거나 ID가 빈 문자열이면 EMPTY 반환.
   */
  async resolve(rawId: string | undefined): Promise<JobImagesResponse> {
    const id = (rawId ?? '').trim();
    if (!id) return EMPTY;

    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return EMPTY;

    if (job.detailScrapedAt) {
      return {
        images: job.companyPhotos,
        companyLogoUrl: job.companyLogoUrl,
        representativeGames: job.representativeGames,
      };
    }

    // 게임잡 상세 URL은 bare GI_No를 요구하므로 prefix가 붙은 id가 아니라 sourceId를 넘긴다.
    const detail = await this.detail.fetchDetail(job.sourceId || id);
    await this.prisma.job.update({
      where: { id },
      data: {
        companyLogoUrl: detail.companyLogoUrl,
        companyPhotos: detail.companyPhotos,
        representativeGames: detail.representativeGames,
        detailScrapedAt: new Date(),
      },
    });
    return {
      images: detail.companyPhotos,
      companyLogoUrl: detail.companyLogoUrl,
      representativeGames: detail.representativeGames,
    };
  }
}
