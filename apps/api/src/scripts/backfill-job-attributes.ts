/**
 * 일회성 backfill — 마이그레이션 직후 1회 실행.
 *
 * 목적:
 *   1) 기존 잡들의 derived 컬럼(experienceLevel/employmentType/locations/isRemote)을
 *      tags+title 정규화 결과로 채운다.
 *   2) normalizedKey(company+title) 컬럼을 채우고, 같은 키 그룹 내에서 가장 오래된 잡을
 *      primary(primaryJobId=null)로, 나머지는 그 잡의 alias(primaryJobId=primary.id)로 마킹.
 *
 * 모든 update는 청크 단위(기본 100건)로 단일 트랜잭션. 안전상 dryRun 옵션 지원.
 *
 * 실행:
 *   pnpm --filter api build
 *   DATABASE_URL=... node apps/api/dist/scripts/backfill-job-attributes.js [--dry]
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { makeNormalizedKey } from '../jobs/dedupe';
import { computeAttributes } from '../jobs/job-attributes';

const CHUNK = 100;

async function main() {
  const logger = new Logger('backfill-job-attributes');
  const dryRun = process.argv.includes('--dry');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    const allRows = await prisma.job.findMany({
      select: {
        id: true,
        company: true,
        title: true,
        tags: true,
        registeredAt: true,
      },
      // tie-breaker로 id asc — 같은 registeredAt에서 매 실행마다 primary가 바뀌지 않도록 안정 정렬.
      orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
    });

    logger.log(`대상 잡: ${allRows.length}건`);
    if (allRows.length === 0) return;

    // 1) normalizedKey + 그룹화. 가장 오래된 잡이 primary가 되도록 ASC.
    const groupByKey = new Map<
      string,
      Array<{ id: string; company: string; title: string; tags: string[] }>
    >();
    for (const row of allRows) {
      const key = makeNormalizedKey(row.company, row.title);
      const arr = groupByKey.get(key);
      if (arr) arr.push(row);
      else groupByKey.set(key, [row]);
    }
    logger.log(`정규화 키 수: ${groupByKey.size}`);

    // 2) update payload 준비.
    const updates: Array<{
      id: string;
      normalizedKey: string;
      primaryJobId: string | null;
      experienceLevel: string | null;
      employmentType: string | null;
      locations: string[];
      isRemote: boolean;
    }> = [];

    for (const [key, members] of groupByKey) {
      const primaryId = members[0].id;
      for (const m of members) {
        const attrs = computeAttributes(m.tags, m.title);
        updates.push({
          id: m.id,
          normalizedKey: key,
          primaryJobId: m.id === primaryId ? null : primaryId,
          experienceLevel: attrs.experienceLevel,
          employmentType: attrs.employmentType,
          locations: attrs.locations as string[],
          isRemote: attrs.isRemote,
        });
      }
    }

    const aliasCount = updates.filter((u) => u.primaryJobId !== null).length;
    logger.log(
      `update plan: total=${updates.length} primary=${updates.length - aliasCount} alias=${aliasCount}`,
    );

    if (dryRun) {
      logger.log('--dry 플래그 — DB 갱신 생략');
      return;
    }

    // 3) 청크 단위 트랜잭션. update each.
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((u) =>
          prisma.job.update({
            where: { id: u.id },
            data: {
              normalizedKey: u.normalizedKey,
              primaryJobId: u.primaryJobId,
              experienceLevel: u.experienceLevel,
              employmentType: u.employmentType,
              locations: u.locations,
              isRemote: u.isRemote,
            },
          }),
        ),
        { timeout: 30_000 },
      );
      logger.log(`updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }

    logger.log(`backfill 완료. 영속 dedup primary=${groupByKey.size}, alias=${aliasCount}`);
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[backfill-job-attributes] FATAL:', err);
  process.exit(1);
});
