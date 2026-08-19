import { prisma } from "@/lib/prisma";

/**
 * The coach's memory: one global note plus one note per exercise.
 *
 * `GlobalMemory` is one row per user (#59). `ExerciseMemory` needs no `userId`
 * of its own: it hangs off an exercise, and an exercise now has exactly one
 * owner, so `exerciseId @unique` is correct again.
 */

export async function getGlobalMemory(userId: number) {
  return prisma.globalMemory.findUnique({ where: { userId } });
}

export async function setGlobalMemory(userId: number, notes: string) {
  return prisma.globalMemory.upsert({
    where: { userId },
    update: { notes },
    create: { userId, notes },
  });
}

export async function getExerciseMemory(exerciseId: number) {
  return prisma.exerciseMemory.findUnique({ where: { exerciseId } });
}

export async function setExerciseMemory(exerciseId: number, notes: string) {
  return prisma.exerciseMemory.upsert({
    where: { exerciseId },
    update: { notes },
    create: { exerciseId, notes },
  });
}

/** Every per-exercise note, with the exercise's names. */
export async function listExerciseMemory(userId: number) {
  return prisma.exerciseMemory.findMany({
    where: { exercise: { userId } },
    include: { exercise: { select: { nameFa: true, nameEn: true } } },
    orderBy: { exerciseId: "asc" },
  });
}
