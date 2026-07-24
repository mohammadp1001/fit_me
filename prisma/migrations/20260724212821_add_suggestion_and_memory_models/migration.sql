-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyWeight" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "BodyWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" SERIAL NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "muscles" TEXT[],
    "descriptionFa" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "tipsFa" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipsEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mistakesFa" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mistakesEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wikiUrl" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "startDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "yamlContent" TEXT NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDay" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "ProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExercise" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "setsCount" INTEGER NOT NULL,
    "reps" INTEGER[],
    "displayOrder" INTEGER NOT NULL,
    "supersetGroup" TEXT,

    CONSTRAINT "ProgramExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "programExerciseId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "sets" JSONB NOT NULL,

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" SERIAL NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "programExerciseId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "sets" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMemory" (
    "id" SERIAL NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "ExerciseMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalMemory" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL,

    CONSTRAINT "GlobalMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BodyWeight_userId_date_key" ON "BodyWeight"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_nameFa_key" ON "Exercise"("nameFa");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutLog_userId_programExerciseId_date_key" ON "WorkoutLog"("userId", "programExerciseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_exerciseId_date_key" ON "Suggestion"("exerciseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseMemory_exerciseId_key" ON "ExerciseMemory"("exerciseId");

-- AddForeignKey
ALTER TABLE "BodyWeight" ADD CONSTRAINT "BodyWeight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ProgramDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMemory" ADD CONSTRAINT "ExerciseMemory_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
