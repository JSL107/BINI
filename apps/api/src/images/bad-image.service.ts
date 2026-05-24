import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 사용자가 "이 이미지 잘못됐어요" 버튼으로 신고한 URL을 DB(`bad_image_reports`)
 * 에서 그때그때 조회해 JobImagesService 응답을 필터링한다.
 *
 * DB 기반인 이유: Vercel serverless는 요청마다 다른 function instance에 라우팅
 * 될 수 있는데, 메모리 Set 캐시는 instance별로 독립이라 한 instance에서 받은
 * 신고가 다른 instance의 응답에 반영되지 않는다(사용자가 신고해도 다른 인스턴스
 * 에서 같은 사진이 그대로 보이는 회귀). filterUrls를 매번 DB query로 호출하면
 * instance 간 일관성이 자연 보장됨.
 *
 * 성능: bad_image_reports.imageUrl 컬럼에 index 있고, IN 절은 입력 URL 개수만큼
 * 룩업하므로 게임/회사 사진 수십 건 기준 ms 단위 비용.
 */
@Injectable()
export class BadImageService {
  private readonly logger = new Logger(BadImageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * urls 중 사용자 신고가 들어온 URL을 제거하고 원래 순서를 보존한 새 배열로 반환.
   * 입력이 비어있으면 즉시 빈 배열을 돌려 DB 쿼리를 건너뛴다.
   */
  async filterUrls(urls: readonly string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    try {
      const reports = await this.prisma.badImageReport.findMany({
        where: { imageUrl: { in: [...urls] } },
        select: { imageUrl: true },
      });
      if (reports.length === 0) return [...urls];
      const blocked = new Set(reports.map((r) => r.imageUrl));
      return urls.filter((u) => !blocked.has(u));
    } catch (err) {
      // DB 일시 장애 시 보수적으로 전체 통과 — 신고된 이미지가 잠시 다시
      // 보일 수는 있지만 잡 페이지 자체가 빈 상태가 되진 않게 한다.
      this.logger.warn(`filterUrls DB error: ${String(err)}`);
      return [...urls];
    }
  }

  /** 단일 URL이 신고됐는지 — 잘 안 쓰지만 호환 위해 유지. */
  async isBlocked(url: string): Promise<boolean> {
    if (!url) return false;
    const row = await this.prisma.badImageReport
      .findFirst({ where: { imageUrl: url }, select: { id: true } })
      .catch(() => null);
    return !!row;
  }

  /** 신고 1건 INSERT — 메모리 캐시 갱신은 더 이상 필요 없음(매 응답마다 DB 조회). */
  async report(
    imageUrl: string,
    jobId: string | null,
    reason: string | null,
  ): Promise<void> {
    await this.prisma.badImageReport.create({
      data: {
        imageUrl,
        jobId: jobId ?? undefined,
        reason: reason ?? undefined,
      },
    });
  }
}
