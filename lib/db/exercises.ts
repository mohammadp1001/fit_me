import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The exercise library: lookup, resolution and listing.
 *
 * Moved here from `lib/exercise-lookup.ts` when route handlers stopped talking
 * to Prisma directly (#58). The behaviour is unchanged.
 *
 * `userId` is not a parameter yet: `Exercise` is still a global table. #59
 * gives it an owner, at which point every function here gains the same
 * required `userId` first argument the rest of `lib/db` already has.
 *
 * The single place an exercise name is resolved against the library.
 *
 * Two callers with different needs share it deliberately. `app/api/setup`
 * resolves a name during upload and **creates** the row when nothing matches -
 * correct there, because a YAML naming a new movement should add it. The MCP
 * tools resolve names supplied by a language model and must **never** create:
 * one hallucinated name would silently mint a library row that then competes
 * with the real one for every future upload.
 *
 * Before this module the lookup lived inline in the upload route, and the two
 * behaviours could not diverge because only one existed. Keeping one resolver
 * means the ordering rule below is enforced for both.
 */

/** The fields every caller needs; keeps the return type stable across callers. */
const SELECT = {
  id: true,
  nameFa: true,
  nameEn: true,
  musclesPrimary: true,
  musclesSecondary: true,
} satisfies Prisma.ExerciseSelect;

export type ExerciseRef = Prisma.ExerciseGetPayload<{ select: typeof SELECT }>;

/**
 * Finds a library exercise by either of its names, or null.
 *
 * **The order is load-bearing and is the fix for #45.** `nameFa` is `@unique`
 * and canonical, so it is tried first with `findUnique`. `nameEn` is *not*
 * unique, so the fallback pins `orderBy: { id: "asc" }` - without that
 * tie-break, which of several same-`nameEn` rows you get is undefined, and a
 * program can silently rebind to a different exercise between uploads.
 *
 * Matching either name is what stops an English-named YAML minting duplicates
 * of the Persian-named seed rows.
 */
export async function findExerciseByName(name: string): Promise<ExerciseRef | null> {
  const byFa = await prisma.exercise.findUnique({
    where: { nameFa: name },
    select: SELECT,
  });
  if (byFa) {
    return byFa;
  }

  return prisma.exercise.findFirst({
    where: { nameEn: name },
    orderBy: { id: "asc" },
    select: SELECT,
  });
}

export class ExerciseNotFoundError extends Error {
  constructor(
    readonly name: string,
    readonly suggestions: ExerciseRef[],
  ) {
    const hint = suggestions.length
      ? ` Did you mean: ${suggestions.map((s) => `"${s.nameEn}"`).join(", ")}?`
      : " Call list_exercises to see the available names.";
    super(`No exercise named "${name}" exists in the library.${hint}`);
    this.name = "ExerciseNotFoundError";
  }
}

export class AmbiguousExerciseError extends Error {
  constructor(
    readonly requested: string,
    readonly matches: ExerciseRef[],
  ) {
    super(
      `"${requested}" matches ${matches.length} library exercises ` +
        `(ids ${matches.map((m) => m.id).join(", ")}). ` +
        `Use the Persian name to disambiguate: ` +
        `${matches.map((m) => `"${m.nameFa}"`).join(", ")}.`,
    );
    this.name = "AmbiguousExerciseError";
  }
}

/**
 * Resolves a name for a caller that must not create anything.
 *
 * Fails loudly in both directions rather than guessing:
 *
 * - **Unknown name** -> `ExerciseNotFoundError`, carrying near-matches so the
 *   model can correct itself in one turn instead of retrying blindly.
 * - **Ambiguous `nameEn`** -> `AmbiguousExerciseError`. `findExerciseByName`
 *   would quietly return the lowest id here, which is the right default for an
 *   upload rebinding an existing program but the wrong one for a chatbot
 *   reading history: silently reporting the wrong lift's numbers is worse than
 *   refusing.
 */
export async function resolveExerciseStrict(name: string): Promise<ExerciseRef> {
  const trimmed = name.trim();

  const byFa = await prisma.exercise.findUnique({
    where: { nameFa: trimmed },
    select: SELECT,
  });
  if (byFa) {
    // An exact `nameFa` hit is unique by construction, so it is never ambiguous
    // even when other rows share its `nameEn`.
    return byFa;
  }

  const byEn = await prisma.exercise.findMany({
    where: { nameEn: trimmed },
    orderBy: { id: "asc" },
    select: SELECT,
  });
  if (byEn.length === 1) {
    return byEn[0];
  }
  if (byEn.length > 1) {
    throw new AmbiguousExerciseError(trimmed, byEn);
  }

  throw new ExerciseNotFoundError(trimmed, await suggestExercises(trimmed));
}

/**
 * Near-matches for a failed lookup.
 *
 * Substring rather than edit distance: the realistic failure is a model writing
 * "Chest Press" for "Machine Chest Press", not a typo. Case-insensitive because
 * capitalisation is the other thing models vary freely.
 */
export async function suggestExercises(
  name: string,
  limit = 5,
): Promise<ExerciseRef[]> {
  const needle = name.trim();
  if (!needle) {
    return [];
  }

  const contains = await prisma.exercise.findMany({
    where: {
      OR: [
        { nameEn: { contains: needle, mode: "insensitive" } },
        { nameFa: { contains: needle, mode: "insensitive" } },
      ],
    },
    orderBy: { id: "asc" },
    take: limit,
    select: SELECT,
  });
  if (contains.length > 0) {
    return contains;
  }

  // Nothing contains the whole string, so try its longest word - this is what
  // turns "Incline Barbell Bench" into the Bench Press family.
  const longestWord = needle
    .split(/\s+/)
    .sort((a, b) => b.length - a.length)[0];
  if (!longestWord || longestWord.length < 3 || longestWord === needle) {
    return [];
  }

  return prisma.exercise.findMany({
    where: {
      OR: [
        { nameEn: { contains: longestWord, mode: "insensitive" } },
        { nameFa: { contains: longestWord, mode: "insensitive" } },
      ],
    },
    orderBy: { id: "asc" },
    take: limit,
    select: SELECT,
  });
}

/** One exercise by id, or null. */
export async function getExercise(id: number) {
  return prisma.exercise.findUnique({ where: { id } });
}

/** Applies a validated patch to one exercise and returns the new row. */
export async function updateExercise(
  id: number,
  data: Record<string, unknown>,
) {
  return prisma.exercise.update({ where: { id }, data });
}

/**
 * The library, optionally filtered by a case-insensitive substring on either
 * name. Used by the MCP `list_exercises` tool.
 */
export async function listExercises({
  search,
  limit,
}: { search?: string; limit: number }) {
  return prisma.exercise.findMany({
    where: search
      ? {
          OR: [
            { nameEn: { contains: search, mode: "insensitive" } },
            { nameFa: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { id: "asc" },
    take: limit,
    select: {
      nameFa: true,
      nameEn: true,
      musclesPrimary: true,
      musclesSecondary: true,
    },
  });
}
