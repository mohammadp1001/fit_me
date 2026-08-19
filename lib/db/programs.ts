import { prisma } from "@/lib/prisma";
import type { ParsedProgram } from "@/lib/yaml-parser";
import { findExerciseByName } from "./exercises";

/**
 * Programs, days and slots.
 *
 * Every function here takes `userId` as its first argument, and that is the
 * whole point of `lib/db`: route handlers no longer touch Prisma, so a query
 * cannot forget to scope itself. Forget the argument and it does not compile;
 * reach for `prisma` in a route and ESLint stops you.
 *
 * See `HANDOFF.md` -> "Planned: multi-user accounts" for why this was chosen
 * over a Prisma client extension that injects `where: { userId }` invisibly.
 */

/** Days, slots and exercises, ordered the way they are performed. */
const FULL_PROGRAM = {
  days: {
    orderBy: { dayNumber: "asc" as const },
    include: {
      exercises: {
        orderBy: { displayOrder: "asc" as const },
        include: { exercise: true },
      },
    },
  },
};

export async function getActiveProgram(userId: number) {
  return prisma.program.findFirst({
    where: { userId, isActive: true },
    include: FULL_PROGRAM,
  });
}

export async function getProgramById(userId: number, id: number) {
  return prisma.program.findFirst({
    where: { id, userId },
    include: FULL_PROGRAM,
  });
}

/** Summary rows for the program switcher. */
export async function listPrograms(userId: number) {
  return prisma.program.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    select: {
      id: true,
      nameFa: true,
      nameEn: true,
      startDate: true,
      isActive: true,
    },
  });
}

/** Programs with a day count, for the MCP `list_programs` tool. */
export async function listProgramsWithDayCount(userId: number) {
  return prisma.program.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    include: { _count: { select: { days: true } } },
  });
}

export async function findProgram(userId: number, id: number) {
  return prisma.program.findFirst({ where: { id, userId } });
}

/** Deactivates every program for this user, then activates one of theirs. */
export async function activateProgram(userId: number, programId: number) {
  await prisma.program.updateMany({
    where: { userId },
    data: { isActive: false },
  });
  return prisma.program.update({
    where: { id: programId },
    data: { isActive: true },
  });
}

export type DeleteProgramResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "active" };

/**
 * Deletes a program.
 *
 * Workout logs are deliberately NOT deleted. They are the user's training
 * history and outlive the program they happened to be logged under - deleting
 * a program used to destroy them permanently (#48). The `programExerciseId`
 * foreign key is `ON DELETE SET NULL`, so the cascade simply detaches each log
 * from the slot it was recorded in and leaves `exerciseId`, the durable key,
 * intact.
 */
export async function deleteProgram(
  userId: number,
  programId: number,
): Promise<DeleteProgramResult> {
  const owned = await findProgram(userId, programId);
  if (!owned) {
    return { ok: false, reason: "not-found" };
  }
  if (owned.isActive) {
    return { ok: false, reason: "active" };
  }

  await prisma.program.delete({ where: { id: programId } });
  return { ok: true };
}

/**
 * The active program's slot for an exercise.
 *
 * When a program lists the same exercise twice, the lowest `displayOrder`
 * wins - deterministic, and it matches the order the day is performed in.
 */
export async function findActiveSlotFor(userId: number, exerciseId: number) {
  return prisma.programExercise.findFirst({
    where: { exerciseId, day: { program: { userId, isActive: true } } },
    orderBy: [{ day: { dayNumber: "asc" } }, { displayOrder: "asc" }],
  });
}

/**
 * Installs a parsed YAML program and makes it the active one.
 *
 * This is the whole upload transaction as one operation, moved out of
 * `app/api/setup` unchanged. Every rule it encodes was paid for by a bug:
 *
 * - exercises are matched by **either** name and created only on a real miss
 *   (#45 - matching `nameFa` alone minted a duplicate on every upload)
 * - `muscles` and `video` are **overwritten** whenever the upload supplies
 *   them (#44 - backfill-only meant a stale MuscleWiki link could never be
 *   corrected through the app)
 * - guide prose is **backfill-only**, so a terser YAML cannot blank
 *   hand-written text
 */
export async function installProgram(
  userId: number,
  program: ParsedProgram,
  yamlContent: string,
) {
  await prisma.program.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  // Days are created in a nested write - a single round-trip.
  const newProgram = await prisma.program.create({
    data: {
      userId,
      nameFa: program.name,
      nameEn: program.name_en ?? program.name,
      yamlContent,
      isActive: true,
      days: {
        create: program.days.map((day, dayIdx) => ({
          dayNumber: dayIdx + 1,
          nameFa: day.name,
          nameEn: day.name_en ?? day.name,
        })),
      },
    },
    include: { days: true },
  });

  let supersetGroupCounter = 0;

  for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
    const day = program.days[dayIdx];
    const dbDay = newProgram.days.find((d) => d.dayNumber === dayIdx + 1)!;
    const supersetMap = new Map<string, string>();

    for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
      const ex = day.exercises[exIdx];

      // Creating on a miss is this path's own behaviour: a YAML naming a new
      // movement should add it. The MCP tools must never create - see
      // `resolveExerciseStrict` in `lib/db/exercises.ts`.
      const found = await findExerciseByName(ex.name);
      let dbExercise = found
        ? await prisma.exercise.findUnique({ where: { id: found.id } })
        : null;

      if (!dbExercise) {
        dbExercise = await prisma.exercise.create({
          data: {
            nameFa: ex.name,
            nameEn: ex.name,
            musclesPrimary: ex.musclesPrimary,
            musclesSecondary: ex.musclesSecondary,
            videoUrl: ex.video ?? "",
            descriptionFa: ex.description ?? "",
            descriptionEn: ex.description_en ?? ex.description ?? "",
            tipsFa: ex.tips ?? [],
            tipsEn: ex.tips_en ?? ex.tips ?? [],
            mistakesFa: ex.mistakes ?? [],
            mistakesEn: ex.mistakes_en ?? ex.mistakes ?? [],
          },
        });
      } else {
        // Muscles and the video URL are overwritten; prose is backfill-only.
        // Muscles come from a closed enum where every value is valid, and a
        // video URL is a single pointer that is either right or wrong - there
        // is nothing to protect, and overwriting is the only way a user can
        // ever correct a mis-tagged exercise or a stale link. `ex.video` is
        // still guarded, so an upload that omits `video:` leaves the stored
        // URL alone rather than blanking it.
        const patch: Record<string, unknown> = {
          musclesPrimary: ex.musclesPrimary,
          musclesSecondary: ex.musclesSecondary,
        };
        const descEn = ex.description_en ?? ex.description;
        const tipsEn = ex.tips_en ?? ex.tips;
        const mistakesEn = ex.mistakes_en ?? ex.mistakes;
        if (ex.video) patch.videoUrl = ex.video;
        if (ex.description && !dbExercise.descriptionFa) patch.descriptionFa = ex.description;
        if (descEn && !dbExercise.descriptionEn) patch.descriptionEn = descEn;
        if (ex.tips?.length && dbExercise.tipsFa.length === 0) patch.tipsFa = ex.tips;
        if (tipsEn?.length && dbExercise.tipsEn.length === 0) patch.tipsEn = tipsEn;
        if (ex.mistakes?.length && dbExercise.mistakesFa.length === 0) patch.mistakesFa = ex.mistakes;
        if (mistakesEn?.length && dbExercise.mistakesEn.length === 0) patch.mistakesEn = mistakesEn;
        if (Object.keys(patch).length > 0) {
          dbExercise = await prisma.exercise.update({
            where: { id: dbExercise.id },
            data: patch,
          });
        }
      }

      let supersetGroup: string | null = null;
      if (ex.superset_with) {
        const key = [ex.name, ex.superset_with].sort().join("|");
        if (!supersetMap.has(key)) {
          supersetGroupCounter++;
          supersetMap.set(key, `ss_${supersetGroupCounter}`);
        }
        supersetGroup = supersetMap.get(key)!;
      }

      await prisma.programExercise.create({
        data: {
          dayId: dbDay.id,
          exerciseId: dbExercise.id,
          setsCount: ex.sets,
          reps: Array.isArray(ex.reps) ? ex.reps : [ex.reps],
          displayOrder: exIdx,
          supersetGroup,
        },
      });
    }
  }

  return newProgram;
}
