-- AlterTable: dedup 영속화 키 + 자기참조 alias 관계
ALTER TABLE "jobs" ADD COLUMN "normalizedKey" TEXT;
ALTER TABLE "jobs" ADD COLUMN "primaryJobId" TEXT;

-- AlterTable: cron 시점에 추출되는 derived 속성 컬럼
ALTER TABLE "jobs" ADD COLUMN "experienceLevel" TEXT;
ALTER TABLE "jobs" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "jobs" ADD COLUMN "locations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "jobs" ADD COLUMN "isRemote" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "jobs_normalizedKey_idx" ON "jobs"("normalizedKey");
CREATE INDEX "jobs_primaryJobId_idx" ON "jobs"("primaryJobId");
CREATE INDEX "jobs_experienceLevel_idx" ON "jobs"("experienceLevel");
CREATE INDEX "jobs_employmentType_idx" ON "jobs"("employmentType");
CREATE INDEX "jobs_isRemote_idx" ON "jobs"("isRemote");

-- AddForeignKey: alias 잡이 primary가 삭제되면 자기는 primary로 승격되도록 SET NULL
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_primaryJobId_fkey" FOREIGN KEY ("primaryJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
