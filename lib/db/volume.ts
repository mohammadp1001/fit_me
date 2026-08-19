import { MuscleGroup } from "@/lib/muscles";
import {
  VOLUME_WINDOW_DAYS,
  toLoggedSets,
  volumeByGroup,
  type VolumeEntry,
} from "@/lib/volume";
import { listLogsSince } from "./logs";

/**
 * Hard-set volume per muscle group, read from the database.
 *
 * Moved here from `lib/volume-server.ts` in #58 so that every Prisma call
 * lives under `lib/db`. The arithmetic itself stays in `lib/volume.ts`, which
 * is pure and unit-tested without a database.
 */

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
 * Hard-set volume per muscle group over the trailing window.
 *
 * Reads logs across all programs: volume is a property of the training that
 * happened, not of whichever program happens to be active now. Muscles are
 * read through the log's own `exerciseId`, so a log whose program has since
 * been deleted still counts.
 */
export async function computeGroupVolume(
  userId: number,
  now: Date = new Date(),
): Promise<Record<MuscleGroup, number>> {
  const logs = await listLogsSince(userId, windowStart(now));

  const entries: VolumeEntry[] = logs
    .filter((log) => log.exercise !== null)
    .map((log) => ({
      date: log.date,
      sets: toLoggedSets(log.sets),
      musclesPrimary: log.exercise!.musclesPrimary,
      musclesSecondary: log.exercise!.musclesSecondary,
    }));

  return volumeByGroup(entries, now);
}
