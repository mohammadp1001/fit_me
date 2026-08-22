import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ParsedProgram } from "@/lib/yaml-parser";
import { exerciseIdFor, findExerciseByName } from "./exercises";
import { addPersonal, entryForRow } from "./library";

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
        // The catalog comes along because an inherited row carries no values of
        // its own - see `entryForRow`.
        include: { exercise: { include: { catalog: true } } },
      },
    },
  },
};

type RawProgram = Prisma.ProgramGetPayload<{ include: typeof FULL_PROGRAM }>;

/**
 * Folds each slot's exercise into its resolved library entry.
 *
 * Screens read `exercise.name`, and on an inherited row that column is null -
 * the values live in the catalog. Resolving here means no caller has to know
 * the rule, and none of them can forget it.
 */
function withResolvedExercises(program: RawProgram) {
  return {
    ...program,
    days: program.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((slot) => ({
        ...slot,
        exercise: {
          ...entryForRow(slot.exercise),
          id: slot.exercise.id,
        },
      })),
    })),
  };
}

export async function getActiveProgram(userId: number) {
  const program = await prisma.program.findFirst({
    where: { userId, isActive: true },
    include: FULL_PROGRAM,
  });
  return program && withResolvedExercises(program);
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
      name: true,
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
 *
 * The `userId` filter is **redundant today and kept deliberately**: an
 * `Exercise` has exactly one owner (#59), so filtering on `exerciseId` already
 * implies the user. Mutation-testing in #61 confirmed removing it changes no
 * behaviour and breaks no test. It stays as defence in depth - if exercise
 * ownership ever loosens, this is the query that would silently start crossing
 * accounts.
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
 *   (#45 - matching `name` alone minted a duplicate on every upload)
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
      name: program.name_en ?? program.name,
      yamlContent,
      isActive: true,
      days: {
        create: program.days.map((day, dayIdx) => ({
          dayNumber: dayIdx + 1,
          name: day.name_en ?? day.name,
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

      // Resolve against the user's library - the shared catalog plus their
      // own additions. Creating on a miss is this path's own behaviour: a YAML
      // naming a movement the catalog does not have should add it as a
      // personal exercise. The MCP tools must never create - see
      // `resolveExerciseStrict` in `lib/db/exercises.ts`.
      const found = await findExerciseByName(userId, ex.name);

      // Materialise even for a catalog hit: a program slot points at
      // `Exercise.id`, so the row has to exist before it can be referenced.
      const exerciseId = found
        ? await exerciseIdFor(userId, found)
        : await addPersonal(userId, {
            name: ex.name,
            musclesPrimary: ex.musclesPrimary,
            musclesSecondary: ex.musclesSecondary,
            description: ex.description_en ?? ex.description ?? "",
            videoUrl: ex.video ?? "",
          });

      // A catalog exercise the user has not overridden keeps inheriting, so an
      // upload no longer rewrites anatomy. That was the whole reason a sloppy
      // YAML could corrupt the volume chart. Only a personal exercise - one
      // this account owns outright - can be updated from a file.
      if (found?.source === "personal" && found.exerciseId !== null) {
        const patch: Record<string, unknown> = {
          musclesPrimary: ex.musclesPrimary,
          musclesSecondary: ex.musclesSecondary,
        };
        if (ex.video) patch.videoUrl = ex.video;
        await prisma.exercise.update({
          where: { id: found.exerciseId },
          data: patch,
        });
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
          exerciseId,
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
