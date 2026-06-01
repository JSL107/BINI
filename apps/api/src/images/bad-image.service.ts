import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 사용자가 "이 이미지 잘못됐어요" 버튼으로 신고한 URL을 영속한다.
 * `JobImagesService` / `ImagesService`가 응답 직전 입력 URL 셋에 대해
 * `imageUrl IN (...)` indexed lookup으로 차단 판정한다.
 *
 * 의도적으로 메모리 캐시를 두지 않는다 — Vercel 서버리스 다중 인스턴스에서
 * 한 인스턴스의 신고가 다른 인스턴스에 즉시 보이지 않는 staleness를 원천 차단.
 * 응답당 1회 indexed query라 비용은 ms 단위 (`@@index([imageUrl])` 의존).
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
   * 입력 URLs 중 신고된 것들의 Set을 반환. 호출 측이 여러 후보군(예: 게임/회사
   * 이미지)을 union해서 한 번에 차단 판정하고 싶을 때 사용 — DB roundtrip 1회.
   */
  async findBlocked(urls: readonly string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set();
    const rows = await this.prisma.badImageReport.findMany({
      where: { imageUrl: { in: [...urls] } },
      select: { imageUrl: true },
    });
    return new Set(rows.map((r) => r.imageUrl));
  }

  /** 차단 URL을 제거하고 순서를 보존한 새 배열을 반환. */
  async filterUrls(urls: readonly string[]): Promise<string[]> {
    const blocked = await this.findBlocked(urls);
    if (blocked.size === 0) return [...urls];
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
