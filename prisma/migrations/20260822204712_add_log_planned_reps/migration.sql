-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "plannedReps" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
