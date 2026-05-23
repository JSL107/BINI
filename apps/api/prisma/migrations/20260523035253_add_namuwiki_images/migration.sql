-- CreateTable
CREATE TABLE "namuwiki_images" (
    "gameName" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "namuwiki_images_pkey" PRIMARY KEY ("gameName")
);
