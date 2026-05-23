/**
 * GitHub Actions cron 진입점.
 *
 * 절차:
 *   1) page 1부터 시작해 JobsCronService.scrapeAndUpsert(page) 호출.
 *   2) early-stop — 한 페이지에서 신규 잡 비율이 EARLY_STOP_THRESHOLD 미만이면 다음 페이지 안 봄.
 *      단 page 1은 항상 처리한다(신규가 0이라도 비교 기준이 필요하므로).
 *   3) 전체 소스가 실패한 페이지(totalFailure=true)를 만나면 즉시 종료한다.
 *   4) MAX_PAGES 도달 시 안전장치로 중단.
 *   5) sweepExpired() 호출 — lastSeenAt이 7일 넘은 잡에 expiredAt 마킹.
 *
 * Vercel 런타임에서는 호출되지 않는다. GitHub Actions `refresh-jobs.yml`에서만 실행.
 * 실행:
 *   pnpm --filter api build && node apps/api/dist/scripts/cron-jobs.js
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { JobsCronService } from '../jobs/jobs-cron.service';

const MAX_PAGES = Number(process.env.CRON_MAX_PAGES ?? '20');
const EARLY_STOP_THRESHOLD = Number(process.env.CRON_EARLY_STOP_THRESHOLD ?? '0.2');

async function main() {
  const logger = new Logger('cron-jobs');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const jobsCron = app.get(JobsCronService);

    let totalNew = 0;
    let totalDeduped = 0;
    let pagesProcessed = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await jobsCron.scrapeAndUpsert(page);
      pagesProcessed += 1;
      totalNew += result.newCount;
      totalDeduped += result.dedupedCount;

      if (result.totalFailure) {
        logger.error(`page ${page}: 전체 소스 실패. 다음 페이지 진행 중단.`);
        break;
      }

      // page 1은 항상 처리하지만, 그 외 페이지는 신규 비율 기준으로 early-stop.
      if (page >= 1 && result.dedupedCount > 0) {
        const newRatio = result.newCount / result.dedupedCount;
        if (page > 1 && newRatio < EARLY_STOP_THRESHOLD) {
          logger.log(
            `page ${page}: 신규 비율 ${(newRatio * 100).toFixed(1)}% < ` +
              `${(EARLY_STOP_THRESHOLD * 100).toFixed(0)}% → early-stop`,
          );
          break;
        }
      }

      // 사이트 totalPages를 넘으면 중단.
      if (result.totalPages > 0 && page >= result.totalPages) {
        logger.log(`page ${page}: totalPages(${result.totalPages}) 도달 → 종료`);
        break;
      }
    }

    const expired = await jobsCron.sweepExpired();

    logger.log(
      `[summary] pages=${pagesProcessed} dedupedTotal=${totalDeduped} ` +
        `newTotal=${totalNew} expired=${expired}`,
    );
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[cron-jobs] FATAL:', err);
  process.exit(1);
});
