-- CreateTable
CREATE TABLE "jobplanet_companies" (
    "companyName" TEXT NOT NULL,
    "companyUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "salaryAvg" INTEGER,
    "status" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobplanet_companies_pkey" PRIMARY KEY ("companyName")
);
