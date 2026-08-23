-- A user's library becomes the shared catalog plus their own additions,
-- minus what they hid. Rows here are materialised on first use rather than
-- copied at signup. No data to preserve.

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "catalogSlug" TEXT,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "name" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_userId_catalogSlug_key" ON "Exercise"("userId", "catalogSlug");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_catalogSlug_fkey" FOREIGN KEY ("catalogSlug") REFERENCES "ExerciseCatalog"("slug") ON DELETE SET NULL ON UPDATE CASCADE;


-- Curated catalog entries carry a reference link.
-- AlterTable
ALTER TABLE "ExerciseCatalog" ADD COLUMN     "wikiUrl" TEXT NOT NULL DEFAULT '';

