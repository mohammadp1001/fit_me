import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Coach suggestions: one proposal per exercise per date.
 *
 * The log screen reads these by `programExerciseId` + date, which is why a
 * suggestion must always point at a slot in the active program.
 */

export async function getSuggestionBySlot(
  _userId: number,
  programExerciseId: number,
  date: Date,
) {
  return prisma.suggestion.findFirst({ where: { programExerciseId, date } });
}

export async function getSuggestionByExercise(
  _userId: number,
  exerciseId: number,
  date: Date,
) {
  return prisma.suggestion.findUnique({
    where: { exerciseId_date: { exerciseId, date } },
  });
}

export async function upsertSuggestion(
  _userId: number,
  {
    exerciseId,
    programExerciseId,
    date,
    sets,
    rationale,
  }: {
    exerciseId: number;
    programExerciseId: number;
    date: Date;
    sets: Prisma.InputJsonValue;
    rationale: string;
  },
) {
  return prisma.suggestion.upsert({
    where: { exerciseId_date: { exerciseId, date } },
    update: { programExerciseId, sets, rationale },
    create: { exerciseId, programExerciseId, date, sets, rationale },
  });
}
