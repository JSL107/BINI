-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "companyLogoUrl" TEXT,
ADD COLUMN     "companyPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "detailScrapedAt" TIMESTAMPTZ(3),
ADD COLUMN     "representativeGames" TEXT[] DEFAULT ARRAY[]::TEXT[];
