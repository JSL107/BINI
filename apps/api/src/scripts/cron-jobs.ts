/**
 * GitHub Actions cron 진입점.
 *
 * 절차:
 *   1) page 1부터 시작해 JobsCronService.scrapeAndUpsert(page) 호출.
 *   2) early-stop — 한 페이지에서 신규 잡 비율이 EARLY_STOP_THRESHOLD 미만이면 다음 페이지 안 봄.
 *      단 page 1은 항상 처리한다(신규가 0이라도 비교 기준이 필요하므로).
 *   3) 전체 소스가 실패한 페이지(totalFailure=true)를 만나면 즉시 종료한다.
 *   4) MAX_PAGES 도달 시 안전장치로 중단.
 *   5) sweepExpired() — lastSeenAt이 7일 넘은 잡에 expiredAt 마킹.
 *   6) rescrapeStaleDetails() — detailScrapedAt이 1일 넘은(또는 null인) 게임잡 잡들을
 *      limit건 재스크래핑해 회사 로고·사진·대표게임·본문 키아트 최신화. 사용자
 *      클릭이 없어 lazy enrichment가 일어나지 않은 잡까지 cron이 따라잡는다.
 *   7) `cron_runs` ledger에 시작/종료/집계/실패원인을 한 행으로 영속화 — 운영 가시성.
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
import { PrismaService } from '../prisma/prisma.service';

const MAX_PAGES = Number(process.env.CRON_MAX_PAGES ?? '20');
const EARLY_STOP_THRESHOLD = Number(process.env.CRON_EARLY_STOP_THRESHOLD ?? '0.2');
const DETAIL_RESCRAPE_LIMIT = Number(process.env.CRON_DETAIL_RESCRAPE_LIMIT ?? '100');

type CronStatus = 'success' | 'partial_failure' | 'total_failure' | 'crashed';

async function main() {
  const logger = new Logger('cron-jobs');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);

  // ledger 행을 먼저 열어둔다 — 중간에 크래시해도 startedAt + status='crashed'으로 닫을 수 있게.
  const ledger = await prisma.cronRun.create({
    data: { status: 'success' }, // 낙관적 초기값. 실패하면 아래에서 덮어쓴다.
  });
  const startMs = ledger.startedAt.getTime();

  let totalNew = 0;
  let totalDeduped = 0;
  let totalScraped = 0;
  let pagesProcessed = 0;
  let expiredSwept = 0;
  let detailAttempted = 0;
  let detailUpdated = 0;
  let detailFailed = 0;
  const failedSourcesSet = new Set<string>();
  let status: CronStatus = 'success';
  let errorMessage: string | null = null;

  try {
    const jobsCron = app.get(JobsCronService);

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await jobsCron.scrapeAndUpsert(page);
      pagesProcessed += 1;
      totalNew += result.newCount;
      totalDeduped += result.dedupedCount;
      totalScraped += result.scrapedCount;
      for (const src of result.failedSources) failedSourcesSet.add(src);

      if (result.totalFailure) {
        logger.error(`page ${page}: 전체 소스 실패. 다음 페이지 진행 중단.`);
        status = 'total_failure';
        errorMessage = `page ${page}: all sources failed (${result.failedSources.join(',')})`;
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

    if (status === 'success' && failedSourcesSet.size > 0) {
      status = 'partial_failure';
    }

    expiredSwept = await jobsCron.sweepExpired();
    const rescrape = await jobsCron.rescrapeStaleDetails({
      limit: DETAIL_RESCRAPE_LIMIT,
    });
    detailAttempted = rescrape.attempted;
    detailUpdated = rescrape.updated;
    detailFailed = rescrape.failed;

    logger.log(
      `[summary] pages=${pagesProcessed} dedupedTotal=${totalDeduped} ` +
        `newTotal=${totalNew} expired=${expiredSwept} ` +
        `detailRescrape=${detailUpdated}/${detailAttempted} (failed=${detailFailed}) ` +
        `status=${status}`,
    );
  } catch (err) {
    status = 'crashed';
    errorMessage = String((err as Error)?.message ?? err).slice(0, 140);
    logger.error(`[crashed] ${errorMessage}`);
    throw err; // 끝에서 ledger 닫고 다시 던진다 — GitHub Actions가 실패로 인지.
  } finally {
    const finishedAt = new Date();
    // 안전: ledger 업데이트가 실패해도 main 흐름은 끝나야 한다.
    await prisma.cronRun
      .update({
        where: { id: ledger.id },
        data: {
          finishedAt,
          status,
          pagesProcessed,
          scrapedTotal: totalScraped,
          dedupedTotal: totalDeduped,
          newTotal: totalNew,
          expiredSwept,
          detailRescrapeAttempted: detailAttempted,
          detailRescrapeUpdated: detailUpdated,
          detailRescrapeFailed: detailFailed,
          failedSources: Array.from(failedSourcesSet),
          errorMessage,
          durationMs: finishedAt.getTime() - startMs,
        },
      })
      .catch((e) =>
        logger.warn(`cronRun ledger update 실패: ${String(e).slice(0, 140)}`),
      );
    await app.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[cron-jobs] FATAL:', err);
  process.exit(1);
});
