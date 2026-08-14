-- Workout logs belong to the user's training history, not to a program.
--
-- Before this, `WorkoutLog` hung off `ProgramExercise` only, so deleting a
-- program destroyed the sets logged under it. `exerciseId` becomes the durable
-- key; `programExerciseId` is downgraded to optional context.

-- 1. The durable key. Nullable only because the table already has rows.
ALTER TABLE "WorkoutLog" ADD COLUMN "exerciseId" INTEGER;

-- 2. Backfill it from the program slot each log was recorded under.
UPDATE "WorkoutLog" wl
SET "exerciseId" = pe."exerciseId"
FROM "ProgramExercise" pe
WHERE wl."programExerciseId" = pe."id"
  AND wl."exerciseId" IS NULL;

-- 3. Refuse to continue rather than silently discard history.
--
-- The new uniqueness key is (userId, exerciseId, date). The old one was per
-- program slot, so a user who logged the same exercise twice on one date under
-- two different slots now has a collision. That is rare but real, and merging
-- two sets of logged sets is a judgement call - so fail loudly and let a human
-- decide, instead of dropping a row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WorkoutLog"
    WHERE "exerciseId" IS NOT NULL
    GROUP BY "userId", "exerciseId", "date"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'WorkoutLog has duplicate (userId, exerciseId, date) rows. Merge them by hand before applying this migration.';
  END IF;
END $$;

-- 4. Program context becomes optional.
ALTER TABLE "WorkoutLog" ALTER COLUMN "programExerciseId" DROP NOT NULL;

-- 5. Swap the uniqueness key over to the exercise.
DROP INDEX "WorkoutLog_userId_programExerciseId_date_key";
CREATE UNIQUE INDEX "WorkoutLog_userId_exerciseId_date_key"
  ON "WorkoutLog"("userId", "exerciseId", "date");

-- 6. Deleting a program now DETACHES its logs instead of destroying them.
ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_programExerciseId_fkey";
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_programExerciseId_fkey"
  FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Suggestions are disposable per-date proposals and go with the program.
-- Without this, deleting a program that had any suggestions failed outright:
-- ProgramExercise cascade-deletes with the program, but nothing cleaned these
-- up, so the foreign key blocked the delete.
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_programExerciseId_fkey";
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_programExerciseId_fkey"
  FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
