-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "expiredAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "jobs_expiredAt_idx" ON "jobs"("expiredAt");
