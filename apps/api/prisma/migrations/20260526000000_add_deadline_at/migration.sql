-- AlterTable: deadline 텍스트를 파싱한 결과 컬럼. NULL 허용 ("상시"/파싱 실패).
ALTER TABLE "jobs" ADD COLUMN "deadlineAt" TIMESTAMPTZ(3);

-- CreateIndex: 마감 임박순 정렬·필터 가속.
CREATE INDEX "jobs_deadlineAt_idx" ON "jobs"("deadlineAt");
