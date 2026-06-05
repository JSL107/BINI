/**
 * 일회성 backfill — `deadlineAt` 컬럼 마이그레이션 직후 1회 실행.
 *
 * 목적: 기존 잡들의 `deadline` 텍스트를 파싱해 `deadlineAt`(Date | null) 컬럼을 채운다.
 *   - "상시"/"수시"/"채용시" → null (의도된 무한 마감)
 *   - "2026-06-01", "06/01(월)", "5월 30일" → 파싱된 Date
 *   - 그 외 / 범위 밖 → null
 *
 * 모든 update는 청크 단위(기본 200건) 트랜잭션. 안전상 `--dry` 옵션 지원.
 *
 * 실행:
 *   pnpm --filter api build
 *   DATABASE_URL=... node apps/api/dist/scripts/backfill-deadline-at.js [--dry]
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { parseDeadlineToDate } from '../jobs/deadline-parser';

const CHUNK = 200;

async function main() {
  const logger = new Logger('backfill-deadline-at');
  const dryRun = process.argv.includes('--dry');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    const allRows = await prisma.job.findMany({
      select: { id: true, deadline: true, registeredAt: true },
      orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
    });

    logger.log(`대상 잡: ${allRows.length}건`);
    if (allRows.length === 0) return;

    // 분포 측정 — critic의 hidden cost 우려에 대한 일회성 진단 로그.
    let parsedCount = 0;
    let nullCount = 0;
    const updates: Array<{ id: string; deadlineAt: Date | null }> = [];
    // 잡마다 registeredAt을 "now" 기준으로 써 작년 데이터의 MM/DD 추정도 합리적으로
    // 맞도록 한다. (현재 시각으로 통일하면 작년 잡의 "12/31"이 30일 cutoff에 걸려
    // 거의 모두 null이 된다.)
    for (const row of allRows) {
      const d = parseDeadlineToDate(row.deadline, row.registeredAt);
      updates.push({ id: row.id, deadlineAt: d });
      if (d) parsedCount++;
      else nullCount++;
    }
    logger.log(
      `파싱 결과: parsed=${parsedCount} null=${nullCount} (parsedRatio=${(parsedCount / allRows.length).toFixed(2)})`,
    );

    if (dryRun) {
      logger.log('--dry 플래그 — DB 갱신 생략');
      return;
    }

    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((u) =>
          prisma.job.update({
            where: { id: u.id },
            data: { deadlineAt: u.deadlineAt },
          }),
        ),
        { timeout: 30_000 },
      );
      logger.log(
        `updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`,
      );
    }

    logger.log(`backfill 완료. parsed=${parsedCount} null=${nullCount}`);
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[backfill-deadline-at] FATAL:', err);
  process.exit(1);
});
