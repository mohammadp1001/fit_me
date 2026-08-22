import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The exercise library: lookup, resolution and listing.
 *
 * Moved here from `lib/exercise-lookup.ts` when route handlers stopped talking
 * to Prisma directly (#58). The behaviour is unchanged.
 *
 * Every function takes `userId` first: an exercise belongs to exactly one
 * account (#59), and a lookup that forgets the owner would read - or edit -
 * someone else's library.
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
  name: true,
  musclesPrimary: true,
  musclesSecondary: true,
} satisfies Prisma.ExerciseSelect;

export type ExerciseRef = Prisma.ExerciseGetPayload<{ select: typeof SELECT }>;

/**
 * Finds a library exercise by name, or null.
 *
 * A single `findUnique`, because `(userId, name)` is unique. This used to be a
 * two-step dance - `nameFa` by unique key, then `nameEn` with an explicit
 * `orderBy: { id: "asc" }` tie-break, because `nameEn` was not unique and
 * without the tie-break a program could silently rebind to a different exercise
 * between uploads (#45). Collapsing to one name removes the ambiguity that bug
 * lived in, so the tie-break has nothing left to protect.
 */
export async function findExerciseByName(
  userId: number,
  name: string,
): Promise<ExerciseRef | null> {
  return prisma.exercise.findUnique({
    where: { userId_name: { userId, name: name.trim() } },
    select: SELECT,
  });
}

export class ExerciseNotFoundError extends Error {
  constructor(
    readonly name: string,
    readonly suggestions: ExerciseRef[],
  ) {
    const hint = suggestions.length
      ? ` Did you mean: ${suggestions.map((s) => `"${s.name}"`).join(", ")}?`
      : " Call list_exercises to see the available names.";
    super(`No exercise named "${name}" exists in the library.${hint}`);
    this.name = "ExerciseNotFoundError";
  }
}

/**
 * Resolves a name for a caller that must not create anything.
 *
 * An unknown name fails with `ExerciseNotFoundError`, carrying near-matches so
 * a model can correct itself in one turn instead of retrying blindly.
 *
 * There is deliberately no ambiguity case any more. While an exercise had two
 * names, a non-unique `nameEn` could match several rows, and this had to refuse
 * rather than quietly report the wrong lift's numbers. One name under a unique
 * constraint matches at most one row, so the situation cannot arise.
 */
export async function resolveExerciseStrict(
  userId: number,
  name: string,
): Promise<ExerciseRef> {
  const trimmed = name.trim();

  const found = await findExerciseByName(userId, trimmed);
  if (found) {
    return found;
  }

  throw new ExerciseNotFoundError(trimmed, await suggestExercises(userId, trimmed));
}

/**
 * Near-matches for a failed lookup.
 *
 * Substring rather than edit distance: the realistic failure is a model writing
 * "Chest Press" for "Machine Chest Press", not a typo. Case-insensitive because
 * capitalisation is the other thing models vary freely.
 */
export async function suggestExercises(
  userId: number,
  name: string,
  limit = 5,
): Promise<ExerciseRef[]> {
  const needle = name.trim();
  if (!needle) {
    return [];
  }

  const contains = await prisma.exercise.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: needle, mode: "insensitive" } },
        { name: { contains: needle, mode: "insensitive" } },
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
      userId,
      OR: [
        { name: { contains: longestWord, mode: "insensitive" } },
        { name: { contains: longestWord, mode: "insensitive" } },
      ],
    },
    orderBy: { id: "asc" },
    take: limit,
    select: SELECT,
  });
}

/**
 * One exercise by id, or null if it does not exist **or belongs to someone
 * else**. Ownership is part of the lookup, not a separate check a caller can
 * forget.
 */
export async function getExercise(userId: number, id: number) {
  return prisma.exercise.findFirst({ where: { id, userId } });
}

/**
 * Applies a validated patch to one of this user's exercises.
 *
 * Returns null when the row is not theirs, so a mistyped or guessed id cannot
 * edit another account's library.
 */
export async function updateExercise(
  userId: number,
  id: number,
  data: Record<string, unknown>,
) {
  const owned = await prisma.exercise.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }
  return prisma.exercise.update({ where: { id }, data });
}

/**
 * The library, optionally filtered by a case-insensitive substring on either
 * name. Used by the MCP `list_exercises` tool.
 */
export async function listExercises(
  userId: number,
  { search, limit }: { search?: string; limit: number },
) {
  return prisma.exercise.findMany({
    where: {
      userId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      name: true,
      musclesPrimary: true,
      musclesSecondary: true,
    },
  });
}
