import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { joinsSession } from "@/lib/sessions";

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

/**
 * Saves a logged exercise, placing it in a workout session.
 *
 * One transaction, because the session a log lands in is decided by reading the
 * user's most recent session: two exercises saved seconds apart must not each
 * conclude there is no session to join and create one.
 *
 * An edit to an existing log touches only its sets and its note. It keeps the
 * session, the `loggedAt` and the `plannedReps` it was first written with - a
 * correction made days later must not move a workout's boundaries or re-measure
 * it against a program that did not exist at the time.
 */
export async function upsertLog(
  userId: number,
  {
    exerciseId,
    programExerciseId,
    date,
    sets,
    plannedReps,
    note = "",
    at = new Date(),
  }: {
    exerciseId: number;
    programExerciseId: number;
    date: Date;
    sets: Prisma.InputJsonValue;
    plannedReps: number[];
    note?: string;
    /** The instant of this save. Injectable so tests can place logs in time. */
    at?: Date;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workoutLog.findUnique({
      where: { userId_exerciseId_date: { userId, exerciseId, date } },
      select: { id: true },
    });

    if (existing) {
      return tx.workoutLog.update({
        where: { id: existing.id },
        data: { sets, programExerciseId, note },
      });
    }

    const sessionId = await sessionFor(tx, userId, at);

    return tx.workoutLog.create({
      data: {
        userId,
        exerciseId,
        programExerciseId,
        date,
        sets,
        plannedReps,
        note,
        loggedAt: at,
        sessionId,
      },
    });
  });
}

/**
 * The session a log made at `at` belongs to, opening one if needed.
 *
 * Joining widens the session to contain the new instant. `startedAt` is only
 * ever pulled earlier and `endedAt` only ever pushed later, so a log that
 * arrives slightly out of order cannot shrink a workout.
 */
async function sessionFor(
  tx: Prisma.TransactionClient,
  userId: number,
  at: Date,
): Promise<number> {
  const latest = await tx.workoutSession.findFirst({
    where: { userId },
    orderBy: { endedAt: "desc" },
    select: { id: true, startedAt: true, endedAt: true },
  });

  if (latest && joinsSession(latest.endedAt, at)) {
    if (at > latest.endedAt || at < latest.startedAt) {
      await tx.workoutSession.update({
        where: { id: latest.id },
        data: {
          startedAt: at < latest.startedAt ? at : latest.startedAt,
          endedAt: at > latest.endedAt ? at : latest.endedAt,
        },
      });
    }
    return latest.id;
  }

  const created = await tx.workoutSession.create({
    data: { userId, startedAt: at, endedAt: at },
    select: { id: true },
  });
  return created.id;
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
