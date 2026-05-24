import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 사용자가 "이 이미지 잘못됐어요" 버튼으로 신고한 URL을 메모리 set으로 보관해
 * `JobImagesService`가 응답 결과를 필터링할 때 O(1)로 차단 판정한다.
 *
 * - 부트 시 DB(`bad_image_reports`)에서 모든 imageUrl을 한 번 로드 (warm cache).
 * - 신고가 들어오면 메모리 set에 즉시 추가 → 같은 요청 사이클 내 응답부터 반영.
 * - 영속은 INSERT-only — 같은 URL이 여러 잡에서 신고되어도 분석용으로 모두 보관.
 *
 * 신뢰 모델: 인증/레이트 리밋이 없어 spam 가능. v1에선 user trust를 가정하고
 * 도배가 보이면 IP 기반 rate limit를 controller 단에 추가하면 됨.
 */
@Injectable()
export class BadImageService implements OnModuleInit {
  private readonly logger = new Logger(BadImageService.name);
  private readonly blocked = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.prisma.badImageReport.findMany({
        select: { imageUrl: true },
      });
      for (const r of rows) this.blocked.add(r.imageUrl);
      this.logger.log(`bad-image cache primed: ${this.blocked.size} url(s)`);
    } catch (err) {
      // DB 부팅 실패 시 빈 set으로 시작 — 다음 응답엔 필터링이 비활성 상태로 동작.
      this.logger.warn(`bad-image cache prime 실패: ${String(err)}`);
    }
  }

  isBlocked(url: string): boolean {
    return this.blocked.has(url);
  }

  /** 차단 URL을 제거하고 순서를 보존한 배열을 새로 반환. */
  filterUrls(urls: readonly string[]): string[] {
    if (this.blocked.size === 0) return [...urls];
    return urls.filter((u) => !this.blocked.has(u));
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
    this.blocked.add(imageUrl);
  }
}
