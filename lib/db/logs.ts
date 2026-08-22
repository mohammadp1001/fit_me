import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Workout logs.
 *
 * A log belongs to the *user* and is keyed on the **exercise**, not on the
 * program slot it happened to be recorded from. That is what lets history
 * outlive the program it was logged under (#48), so every read here filters on
 * `exerciseId` and treats `programExerciseId` as context only.
 */

/** What a program slot asks for, or null if the slot is gone. */
export async function slotTarget(programExerciseId: number): Promise<{
  exerciseId: number;
  setsCount: number;
  reps: number[];
} | null> {
  return prisma.programExercise.findUnique({
    where: { id: programExerciseId },
    select: { exerciseId: true, setsCount: true, reps: true },
  });
}

/** The exercise a program slot trains, or null if the slot is gone. */
export async function exerciseIdForSlot(
  programExerciseId: number,
): Promise<number | null> {
  return (await slotTarget(programExerciseId))?.exerciseId ?? null;
}

/**
 * A program slot's target reps, one entry per set.
 *
 * A slot may carry fewer `reps` than `setsCount`; the log screen has always
 * read the shortfall as "repeat the last value". Expanding here means the rule
 * is applied once, at write, and never has to be reapplied by anything reading
 * a stored snapshot. A slot with no reps at all expands to nothing rather than
 * to a run of zeroes, because zero is a target and "unknown" is not.
 */
export function expandPlannedReps(setsCount: number, reps: number[]): number[] {
  if (reps.length === 0 || setsCount <= 0) return [];
  const last = reps[reps.length - 1];
  return Array.from({ length: setsCount }, (_, i) => reps[i] ?? last);
}

export async function upsertLog(
  userId: number,
  {
    exerciseId,
    programExerciseId,
    date,
    sets,
    plannedReps,
  }: {
    exerciseId: number;
    programExerciseId: number;
    date: Date;
    sets: Prisma.InputJsonValue;
    plannedReps: number[];
  },
) {
  return prisma.workoutLog.upsert({
    where: { userId_exerciseId_date: { userId, exerciseId, date } },
    // `plannedReps` is deliberately absent from the update. It records what was
    // asked for when the session was first logged; re-snapshotting on a later
    // edit would measure that session against whatever program is active by
    // then, which is exactly the drift the column exists to prevent.
    update: { sets, programExerciseId },
    create: { userId, exerciseId, programExerciseId, date, sets, plannedReps },
  });
}

/** Newest first. Used by the exercise-detail history list. */
export async function listLogsForExercise(
  userId: number,
  exerciseId: number,
  { limit }: { limit?: number } = {},
) {
  return prisma.workoutLog.findMany({
    where: { userId, exerciseId },
    orderBy: { date: "desc" },
    ...(limit ? { take: limit } : {}),
  });
}

/**
 * Oldest first, with the slot each set was logged under.
 *
 * The progress chart wants the whole history for one exercise across every
 * program it has ever appeared in, including programs since deleted.
 */
export async function listExerciseHistory(userId: number, exerciseId: number) {
  return prisma.workoutLog.findMany({
    where: { userId, exerciseId },
    orderBy: { date: "asc" },
    include: { programExercise: true },
  });
}

/**
 * Logs recorded under the currently active program, newest first.
 *
 * Deliberately scoped to the active program: the log overview is a view of
 * what you are training now, not an archive.
 */
export async function listActiveProgramLogs(userId: number) {
  return prisma.workoutLog.findMany({
    where: {
      userId,
      programExercise: { day: { program: { isActive: true } } },
    },
    orderBy: { date: "desc" },
    include: { programExercise: { include: { exercise: true, day: true } } },
  });
}

/** Every log in a window, with the muscles each exercise trains. */
export async function listLogsSince(userId: number, from: Date) {
  return prisma.workoutLog.findMany({
    where: { userId, date: { gte: from } },
    include: {
      exercise: {
        select: {
          id: true,
          nameFa: true,
          nameEn: true,
          musclesPrimary: true,
          musclesSecondary: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Whether a session for this exercise on this date has already been logged.
 *
 * As in `findActiveSlotFor`, the `userId` filter is redundant while an exercise
 * has exactly one owner, and kept for the same reason - see that function.
 */
export async function hasLogOn(
  userId: number,
  exerciseId: number,
  date: Date,
): Promise<boolean> {
  const existing = await prisma.workoutLog.findFirst({
    where: { userId, exerciseId, date },
    select: { id: true },
  });
  return existing !== null;
}
