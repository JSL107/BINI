ALTER TABLE "jobs" ADD COLUMN "jobFamilies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "jobs" ADD COLUMN "artSubtypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "jobs_jobFamilies_idx" ON "jobs" USING GIN ("jobFamilies");
