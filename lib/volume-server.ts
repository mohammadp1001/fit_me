import { prisma } from "./prisma";
import { MuscleGroup } from "./muscles";
import {
  VOLUME_WINDOW_DAYS,
  volumeByGroup,
  type LoggedSet,
  type VolumeEntry,
} from "./volume";

/** Today truncated to a day-only `Date`, matching the `@db.Date` columns. */
export function todayDateOnly(now: Date = new Date()): Date {
  return new Date(now.toISOString().slice(0, 10));
}

/** First day included in the trailing window (inclusive). */
export function windowStart(now: Date = new Date()): Date {
  const start = todayDateOnly(now);
  start.setUTCDate(start.getUTCDate() - (VOLUME_WINDOW_DAYS - 1));
  return start;
}

/**
 * Hard-set volume per muscle group over the trailing window, for the single
 * user. Reads logs across all programs: volume is a property of the training
 * that happened, not of whichever program happens to be active now.
 */
export async function computeGroupVolume(
  now: Date = new Date()
): Promise<Record<MuscleGroup, number>> {
  const logs = await prisma.workoutLog.findMany({
    where: { userId: 1, date: { gte: windowStart(now) } },
    include: {
      programExercise: {
        include: {
          exercise: {
            select: { musclesPrimary: true, musclesSecondary: true },
          },
        },
      },
    },
  });

  const entries: VolumeEntry[] = logs.map((log) => ({
    date: log.date,
    sets: log.sets as unknown as LoggedSet[],
    musclesPrimary: log.programExercise.exercise.musclesPrimary,
    musclesSecondary: log.programExercise.exercise.musclesSecondary,
  }));

  return volumeByGroup(entries, now);
}
