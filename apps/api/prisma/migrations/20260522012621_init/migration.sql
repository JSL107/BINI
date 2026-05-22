-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detailUrl" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[],
    "gameTitle" TEXT,
    "imageQuery" TEXT NOT NULL,
    "imageQueryType" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_images" (
    "query" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_images_pkey" PRIMARY KEY ("query")
);

-- CreateIndex
CREATE INDEX "jobs_registeredAt_idx" ON "jobs"("registeredAt");
