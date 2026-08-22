-- CreateTable
CREATE TABLE "ExerciseCatalog" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "musclesPrimary" "Muscle"[],
    "musclesSecondary" "Muscle"[],
    "description" TEXT NOT NULL DEFAULT '',
    "equipment" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL DEFAULT '',
    "mechanic" TEXT NOT NULL DEFAULT '',
    "force" TEXT NOT NULL DEFAULT '',
    "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mistakes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExerciseCatalog_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "ExerciseCatalog_name_idx" ON "ExerciseCatalog"("name");
