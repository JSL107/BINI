-- CreateTable: cron 실행 이력 ledger
CREATE TABLE "cron_runs" (
  "id"                      TEXT NOT NULL,
  "startedAt"               TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"              TIMESTAMPTZ(3),
  "status"                  TEXT NOT NULL,
  "pagesProcessed"          INTEGER NOT NULL DEFAULT 0,
  "scrapedTotal"            INTEGER NOT NULL DEFAULT 0,
  "dedupedTotal"            INTEGER NOT NULL DEFAULT 0,
  "newTotal"                INTEGER NOT NULL DEFAULT 0,
  "expiredSwept"            INTEGER NOT NULL DEFAULT 0,
  "detailRescrapeAttempted" INTEGER NOT NULL DEFAULT 0,
  "detailRescrapeUpdated"   INTEGER NOT NULL DEFAULT 0,
  "detailRescrapeFailed"    INTEGER NOT NULL DEFAULT 0,
  "failedSources"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "errorMessage"            TEXT,
  "durationMs"              INTEGER,

  CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_runs_startedAt_idx" ON "cron_runs"("startedAt");
