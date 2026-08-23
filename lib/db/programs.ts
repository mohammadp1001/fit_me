import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ParsedProgram } from "@/lib/yaml-parser";
import { exerciseIdFor } from "./exercises";
import { entryForRow, findBySlug, resolveLibrary } from "./library";

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

/**
 * Summary rows for the program switcher.
 *
 * Drafts are excluded: a proposal is not something to switch to until it has
 * been approved, and showing it here would be a second, unguarded way to
 * activate it.
 */
export async function listPrograms(userId: number) {
  return prisma.program.findMany({
    where: { userId, isDraft: false },
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
    where: { userId, isDraft: false },
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
  // Approving a draft is what makes it an ordinary program: it stops being a
  // proposal the moment the user accepts it.
  return prisma.program.update({
    where: { id: programId },
    data: { isActive: true, isDraft: false },
  });
}

/** The pending proposal, or null. At most one exists at a time. */
export async function findDraft(userId: number) {
  return prisma.program.findFirst({
    where: { userId, isDraft: true },
    orderBy: { id: "desc" },
    include: FULL_PROGRAM,
  });
}

/** Throws the proposal away. The active program is untouched either way. */
export async function discardDraft(userId: number, programId: number) {
  const { count } = await prisma.program.deleteMany({
    where: { id: programId, userId, isDraft: true },
  });
  return count > 0;
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
 * A slug in the file that the uploader's library does not contain.
 *
 * Carries near-matches, so an author - usually a model - can correct itself in
 * one turn instead of guessing. The upload fails whole: a program with one
 * unknown exercise must not install nine tenths of itself.
 */
export class UnknownExerciseSlugError extends Error {
  constructor(
    readonly slug: string,
    readonly where: string,
    readonly suggestions: string[],
  ) {
    const hint = suggestions.length
      ? ` Did you mean: ${suggestions.map((s) => `\`${s}\``).join(", ")}?`
      : " Call list_exercises to see the available slugs.";
    super(`${where}: no exercise \`${slug}\` in your library.${hint}`);
    this.name = "UnknownExerciseSlugError";
  }
}

/**
 * Installs a parsed YAML program and makes it the active one.
 *
 * A program now says only *which exercise, how many sets, what reps*. Two rules
 * that every previous upload needed are simply gone with the keys that caused
 * them: exercises are addressed by slug, so there is no name matching to get
 * wrong (#45), and the file carries no anatomy, so there is nothing to
 * overwrite (#44). An upload can no longer change what an exercise *is* - which
 * is the whole reason those keys were removed.
 *
 * Nothing is written until every slug resolves. A file naming one unknown
 * exercise leaves the previous program active and untouched.
 *
 * `draft` installs the program without activating it. The rows are identical -
 * a draft is a real program with its days and slots, so the approval screen can
 * diff it against the active one and activating it is a flag flip rather than a
 * second parse.
 */
export async function installProgram(
  userId: number,
  program: ParsedProgram,
  yamlContent: string,
  { draft = false, rationale = "" }: { draft?: boolean; rationale?: string } = {},
) {
  // Resolve everything first. Installing a program that is missing an exercise
  // would leave the user with a broken plan and no previous one to fall back
  // on, since the old program is deactivated as part of the write.
  const resolved = new Map<string, number>();
  for (const [dayIdx, day] of program.days.entries()) {
    for (const [exIdx, ex] of day.exercises.entries()) {
      if (resolved.has(ex.exercise)) continue;

      const entry = await findBySlug(userId, ex.exercise);
      if (!entry) {
        throw new UnknownExerciseSlugError(
          ex.exercise,
          `day ${dayIdx + 1}, exercise ${exIdx + 1}`,
          await suggestSlugs(userId, ex.exercise),
        );
      }
      resolved.set(ex.exercise, await exerciseIdFor(userId, entry));
    }
  }

  // A draft must not disturb what the user is currently following.
  if (!draft) {
    await prisma.program.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
  }

  // Days are created in a nested write - a single round-trip.
  const newProgram = await prisma.program.create({
    data: {
      userId,
      name: program.name,
      yamlContent,
      isActive: !draft,
      isDraft: draft,
      rationale,
      days: {
        create: program.days.map((day, dayIdx) => ({
          dayNumber: dayIdx + 1,
          name: day.name,
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

      let supersetGroup: string | null = null;
      if (ex.superset_with) {
        const key = [ex.exercise, ex.superset_with].sort().join("|");
        if (!supersetMap.has(key)) {
          supersetGroupCounter++;
          supersetMap.set(key, `ss_${supersetGroupCounter}`);
        }
        supersetGroup = supersetMap.get(key)!;
      }

      await prisma.programExercise.create({
        data: {
          dayId: dbDay.id,
          exerciseId: resolved.get(ex.exercise)!,
          setsCount: ex.sets,
          reps: ex.reps,
          displayOrder: exIdx,
          supersetGroup,
          note: ex.note?.trim() ?? "",
        },
      });
    }
  }

  return newProgram;
}

/** Slugs that look like what the author meant. */
async function suggestSlugs(
  userId: number,
  slug: string,
  limit = 5,
): Promise<string[]> {
  const library = await resolveLibrary(userId);
  const needle = slug.replace(/[^a-z0-9]+/g, "");
  if (!needle) return [];

  const contains = library
    .filter((e) => e.slug.replace(/[^a-z0-9]+/g, "").includes(needle))
    .map((e) => e.slug);
  if (contains.length > 0) return contains.slice(0, limit);

  // Nothing contains the whole slug, so try its longest word - this is what
  // turns `incline_db_press` into the incline press family.
  const longest = slug.split("_").sort((a, b) => b.length - a.length)[0];
  if (!longest || longest.length < 3) return [];

  return library
    .filter((e) => e.slug.includes(longest))
    .map((e) => e.slug)
    .slice(0, limit);
}
