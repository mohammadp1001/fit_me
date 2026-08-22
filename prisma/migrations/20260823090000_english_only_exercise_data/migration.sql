-- Exercise, Program and ProgramDay content becomes English-only.
-- The app's interface stays bilingual; only content collapses.
--
-- Columns are dropped rather than merged: there is no data to preserve.

-- DropIndex
DROP INDEX "Exercise_userId_nameFa_key";

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "descriptionEn",
DROP COLUMN "descriptionFa",
DROP COLUMN "mistakesEn",
DROP COLUMN "mistakesFa",
DROP COLUMN "nameEn",
DROP COLUMN "nameFa",
DROP COLUMN "tipsEn",
DROP COLUMN "tipsFa",
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "mistakes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "tips" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "nameEn",
DROP COLUMN "nameFa",
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProgramDay" DROP COLUMN "nameEn",
DROP COLUMN "nameFa",
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_userId_name_key" ON "Exercise"("userId", "name");

