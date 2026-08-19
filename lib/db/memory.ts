import { prisma } from "@/lib/prisma";

/**
 * The coach's memory: one global note plus one note per exercise.
 *
 * `GlobalMemory` is still an `id = 1` singleton - it gains a `userId` in #59.
 * Until then `userId` is accepted and ignored here rather than omitted, so the
 * call sites already read correctly and #59 is a change to this file only.
 */

export async function getGlobalMemory(_userId: number) {
  return prisma.globalMemory.findUnique({ where: { id: 1 } });
}

export async function setGlobalMemory(_userId: number, notes: string) {
  return prisma.globalMemory.upsert({
    where: { id: 1 },
    update: { notes },
    create: { id: 1, notes },
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
export async function listExerciseMemory(_userId: number) {
  return prisma.exerciseMemory.findMany({
    include: { exercise: { select: { nameFa: true, nameEn: true } } },
    orderBy: { exerciseId: "asc" },
  });
}
