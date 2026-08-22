import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Fixture helper: a logged exercise, in a session.
 *
 * Lives in `lib/db` rather than beside the suites that use it because it writes
 * rows, and writing rows is what this directory is for - the Prisma import
 * restriction draws the same line.
 *
 * Every log now belongs to a `WorkoutSession`, so a fixture cannot create one
 * with a bare `prisma.workoutLog.create` any more. Suites that only need
 * "a session for this exercise happened on this date" use this instead of
 * assembling the pair by hand.
 *
 * Each call opens its own session by default, which is what fixtures spread
 * across different days want. Pass `sessionId` to place several exercises in
 * one workout.
 */
export async function createLogFixture(
  prisma: PrismaClient,
  {
    userId,
    exerciseId,
    programExerciseId = null,
    date,
    sets,
    plannedReps = [],
    loggedAt,
    sessionId,
  }: {
    userId: number;
    exerciseId: number;
    programExerciseId?: number | null;
    date: Date;
    sets: Prisma.InputJsonValue;
    plannedReps?: number[];
    /** Defaults to midday on `date`, far from any local midnight. */
    loggedAt?: Date;
    sessionId?: number;
  },
) {
  const at = loggedAt ?? middayOn(date);

  const session =
    sessionId ??
    (
      await prisma.workoutSession.create({
        data: { userId, startedAt: at, endedAt: at },
        select: { id: true },
      })
    ).id;

  return prisma.workoutLog.create({
    data: {
      userId,
      exerciseId,
      programExerciseId,
      date,
      sets,
      plannedReps,
      loggedAt: at,
      sessionId: session,
    },
  });
}

/**
 * Midday UTC on a given date.
 *
 * Fixtures care which day a log lands on, never what time. Midday keeps them
 * clear of every timezone's midnight, so a fixture cannot drift onto the
 * neighbouring day depending on where the test's user is.
 */
function middayOn(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
    ),
  );
}
