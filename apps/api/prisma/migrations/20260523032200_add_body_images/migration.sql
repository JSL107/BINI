-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "bodyImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
