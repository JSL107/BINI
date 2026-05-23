-- 1) NULL 허용으로 컬럼 추가
ALTER TABLE "jobs" ADD COLUMN "source" TEXT;
ALTER TABLE "jobs" ADD COLUMN "sourceId" TEXT;

-- 2) 기존 행 백필: 모두 게임잡 출신, id가 곧 sourceId
UPDATE "jobs" SET "source" = 'gamejob', "sourceId" = "id" WHERE "source" IS NULL;

-- 3) id를 source-prefixed 형식으로 정규화 (idempotent — 이미 prefix가 있으면 skip)
UPDATE "jobs" SET "id" = 'gamejob:' || "id" WHERE "id" NOT LIKE '%:%';

-- 4) NOT NULL 제약 적용
ALTER TABLE "jobs" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "sourceId" SET NOT NULL;

-- 5) 인덱스
CREATE INDEX "jobs_source_idx" ON "jobs"("source");
