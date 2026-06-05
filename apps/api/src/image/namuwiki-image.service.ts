import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 나무위키 이미지 캐시 read-only 조회. `apps/crawler`가 cron으로 채워둔
 * `namuwiki_images` 테이블에서만 읽고, 런타임에선 네트워크 호출을 하지 않는다.
 *
 * 캐시 미스면 그냥 null을 반환 — 즉 "아직 크롤러가 안 다녀간 게임" 또는 "위키
 * 페이지가 없는 게임"은 폴백 (Naver/Google) 단계로 자연스럽게 떨어진다.
 */
@Injectable()
export class NamuwikiImageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 단일 게임명. 캐시 히트 + status='found' 인 경우에만 URL 반환. */
  async lookup(gameName: string): Promise<string | null> {
    const name = gameName.trim();
    if (!name) return null;
    const row = await this.prisma.namuwikiImage.findUnique({
      where: { gameName: name },
    });
    if (!row || row.status !== 'found' || !row.imageUrl) return null;
    return row.imageUrl;
  }

  /**
   * 여러 게임명을 한 번에 — 캐시 히트만 모아 게임명 순서 그대로 배열로 반환
   * (null 항목은 빠짐). 한 잡당 대표게임이 보통 1-4개라 IN 쿼리 1번이 충분.
   */
  async lookupMany(gameNames: readonly string[]): Promise<string[]> {
    const names = Array.from(
      new Set(gameNames.map((n) => n.trim()).filter((n) => n.length > 0)),
    );
    if (names.length === 0) return [];
    const rows = await this.prisma.namuwikiImage.findMany({
      where: { gameName: { in: names } },
    });
    const byName = new Map<string, string>();
    for (const r of rows) {
      if (r.status === 'found' && r.imageUrl)
        byName.set(r.gameName, r.imageUrl);
    }
    // 원래 입력 순서 보존.
    const out: string[] = [];
    for (const name of gameNames) {
      const url = byName.get(name.trim());
      if (url) out.push(url);
    }
    return out;
  }
}
