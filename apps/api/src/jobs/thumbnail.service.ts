import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isGenericBracketTerm } from '../images/job-images.service';

/**
 * getJobsFromDb의 priority 카드(첫 페이지 첫 N개) SSR 썸네일 1장을 결정하는 데
 * 필요한 최소 입력. 모두 Job row에 이미 존재하는 컬럼.
 */
export interface ThumbnailCandidateRow {
  id: string;
  bodyImages: string[];
  representativeGames: string[];
  company: string;
  imageQuery: string;
  imageQueryType: string;
}

/**
 * resolveRepImage(JobImagesService)의 검색어 합성을 그대로 재현 — game_images
 * 캐시 키(query PK)와 정확히 매칭시키기 위함.
 *   1차: "<게임명> <정규화 회사명> 게임"
 *   2차: "<게임명> 게임"  (회사명이 비거나 1차와 동일하면 1개만)
 */
function repQueries(name: string, company: string): string[] {
  const cleanCompany = company
    .replace(/[()[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const primary = cleanCompany
    ? `${name} ${cleanCompany} 게임`
    : `${name} 게임`;
  const fallback = `${name} 게임`;
  return primary === fallback ? [primary] : [primary, fallback];
}

/**
 * combineImages의 bracket fallback 조건과 동일: imageQuery가 게임 타입이고
 * 비어있지 않으며 직군/기술 일반어가 아닐 때만 game_images 캐시 키로 사용.
 */
function bracketQuery(row: ThumbnailCandidateRow): string | null {
  if (
    row.imageQueryType === 'game' &&
    row.imageQuery.length > 0 &&
    !isGenericBracketTerm(row.imageQuery)
  ) {
    return row.imageQuery;
  }
  return null;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * priority 카드용 "외부 호출 0번" 썸네일 resolve. combineImages(JobImagesService)의
 * 신뢰도 우선순위를 캐시/row 조회만으로 재현한다:
 *   1) bodyImages[0]          ← Job row (조회 0)
 *   2) 나무위키 캐시           ← namuwiki_images IN 1회
 *   3) game_images 캐시(대표게임 검색어) ← game_images IN 1회
 *   4) bracket(imageQuery)    ← 위 IN에 포함
 * 그 후 사용자 신고(bad_image_reports) URL을 제거하고 각 잡의 첫 후보를 고른다.
 *
 * 무거운 경로(JobImagesService의 실시간 스크래핑·Naver 검색)는 절대 타지 않는다 —
 * 캐시 미스면 해당 잡은 썸네일 없이(null) 두고, 클라이언트가 기존 lazy fetch로 채운다.
 */
@Injectable()
export class ThumbnailService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCachedThumbnails(
    rows: ThumbnailCandidateRow[],
  ): Promise<Map<string, string>> {
    if (rows.length === 0) return new Map();

    // 1. 나무위키 캐시 — 모든 대표게임을 모아 IN 1회.
    const allGames = unique(
      rows
        .flatMap((r) => r.representativeGames.map((g) => g.trim()))
        .filter((g) => g.length > 0),
    );
    const namuwikiByGame =
      allGames.length > 0
        ? await this.lookupNamuwiki(allGames)
        : new Map<string, string>();

    // 2. game_images 캐시 — 각 row의 대표게임 검색어 + bracket 검색어를 모아 IN 1회.
    const allQueries = unique(
      rows.flatMap((r) => {
        const reps = r.representativeGames.flatMap((g) =>
          repQueries(g, r.company),
        );
        const bracket = bracketQuery(r);
        return bracket ? [...reps, bracket] : reps;
      }),
    );
    const gameImageByQuery =
      allQueries.length > 0
        ? await this.lookupGameImages(allQueries)
        : new Map<string, string>();

    // 3. 각 row의 우선순위 후보 리스트 (combineImages 순서: body > 나무위키 > rep > bracket).
    const candidatesByRow = new Map<string, string[]>();
    for (const r of rows) {
      const namuwikiUrls = r.representativeGames
        .map((g) => namuwikiByGame.get(g.trim()))
        .filter((u): u is string => !!u);
      const repUrls = r.representativeGames
        .flatMap((g) => repQueries(g, r.company))
        .map((q) => gameImageByQuery.get(q))
        .filter((u): u is string => !!u);
      const bracket = bracketQuery(r);
      const bracketUrl = bracket ? gameImageByQuery.get(bracket) : undefined;
      const cands = unique([
        ...r.bodyImages,
        ...namuwikiUrls,
        ...repUrls,
        ...(bracketUrl ? [bracketUrl] : []),
      ]);
      candidatesByRow.set(r.id, cands);
    }

    // 4. bad-image — 모든 후보 union IN 1회.
    const allCandidates = unique([...candidatesByRow.values()].flat());
    const blocked =
      allCandidates.length > 0
        ? await this.findBlocked(allCandidates)
        : new Set<string>();

    // 5. 각 row의 첫 non-blocked 후보를 썸네일로.
    const result = new Map<string, string>();
    for (const [id, cands] of candidatesByRow) {
      const first = cands.find((u) => !blocked.has(u));
      if (first) result.set(id, first);
    }
    return result;
  }

  private async lookupNamuwiki(
    gameNames: string[],
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.namuwikiImage.findMany({
      where: { gameName: { in: gameNames } },
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.status === 'found' && r.imageUrl) map.set(r.gameName, r.imageUrl);
    }
    return map;
  }

  private async lookupGameImages(
    queries: string[],
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.gameImage.findMany({
      where: { query: { in: queries }, status: 'found' },
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      // where로 status='found'를 이미 걸지만, imageUrl null 행을 방어적으로 제외.
      if (r.status === 'found' && r.imageUrl) map.set(r.query, r.imageUrl);
    }
    return map;
  }

  private async findBlocked(urls: string[]): Promise<Set<string>> {
    const rows = await this.prisma.badImageReport.findMany({
      where: { imageUrl: { in: urls } },
      select: { imageUrl: true },
    });
    return new Set(rows.map((r) => r.imageUrl));
  }
}
