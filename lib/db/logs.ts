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

/** The exercise a program slot trains, or null if the slot is gone. */
export async function exerciseIdForSlot(
  programExerciseId: number,
): Promise<number | null> {
  const slot = await prisma.programExercise.findUnique({
    where: { id: programExerciseId },
    select: { exerciseId: true },
  });
  return slot?.exerciseId ?? null;
}

export async function upsertLog(
  userId: number,
  {
    exerciseId,
    programExerciseId,
    date,
    sets,
  }: {
    exerciseId: number;
    programExerciseId: number;
    date: Date;
    sets: Prisma.InputJsonValue;
  },
) {
  return prisma.workoutLog.upsert({
    where: { userId_exerciseId_date: { userId, exerciseId, date } },
    update: { sets, programExerciseId },
    create: { userId, exerciseId, programExerciseId, date, sets },
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

/** Whether a session for this exercise on this date has already been logged. */
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
