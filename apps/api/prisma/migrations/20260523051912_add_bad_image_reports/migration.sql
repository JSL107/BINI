-- CreateTable
CREATE TABLE "bad_image_reports" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "jobId" TEXT,
    "reason" TEXT,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bad_image_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bad_image_reports_imageUrl_idx" ON "bad_image_reports"("imageUrl");

-- CreateIndex
CREATE INDEX "bad_image_reports_jobId_idx" ON "bad_image_reports"("jobId");
