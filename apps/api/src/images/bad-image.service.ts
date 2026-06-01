import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 사용자가 "이 이미지 잘못됐어요" 버튼으로 신고한 URL을 영속한다.
 * `JobImagesService`가 응답 결과를 필터링할 때 입력 URL 셋에 대한 인덱스 lookup
 * (`imageUrl IN (...)`) 한 번으로 차단 판정한다.
 *
 * 의도적으로 메모리 캐시를 두지 않는다 — Vercel 서버리스 다중 인스턴스에서
 * 한 인스턴스의 신고가 다른 인스턴스에 즉시 보이지 않는 staleness를 원천 차단.
 * 응답당 1회 indexed query라 트래픽이 폭증해도 비용은 ms 단위.
 *
 * 영속은 INSERT-only — 같은 URL이 여러 잡에서 신고되어도 분석용으로 모두 보관.
 * 차단 판정은 "해당 URL의 신고 1건 이상" 존재 여부로 한다.
 *
 * 신뢰 모델: 인증/레이트 리밋이 없어 spam 가능. v1에선 user trust를 가정하고
 * 도배가 보이면 IP 기반 rate limit를 controller 단에 추가하면 됨.
 */
@Injectable()
export class BadImageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 차단 URL을 제거하고 순서를 보존한 새 배열을 반환. 입력 셋만 조회하므로
   * bad_image_reports 테이블이 커져도 쿼리 결과는 입력 크기에 의해 bound.
   */
  async filterUrls(urls: readonly string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const rows = await this.prisma.badImageReport.findMany({
      where: { imageUrl: { in: urls as string[] } },
      select: { imageUrl: true },
    });
    if (rows.length === 0) return [...urls];
    const blocked = new Set(rows.map((r) => r.imageUrl));
    return urls.filter((u) => !blocked.has(u));
  }

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
