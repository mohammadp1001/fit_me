import { prisma } from "@/lib/prisma";
import {
  findByName,
  materialise,
  resolveLibrary,
  type LibraryEntry,
} from "./library";

/**
 * Looking exercises up by name.
 *
 * Every lookup now goes through `lib/db/library.ts`, because a user's library
 * is the shared catalog plus their own additions minus what they hid - it is no
 * longer a table you can query directly. Querying `Exercise` here would see
 * only the handful of rows the user has actually used.
 *
 * Every function takes `userId` first: a library belongs to exactly one
 * account, and a lookup that forgets the owner would read someone else's.
 */

export type ExerciseRef = LibraryEntry;

/** Finds an exercise in the user's library by name, or null. */
export async function findExerciseByName(
  userId: number,
  name: string,
): Promise<ExerciseRef | null> {
  return findByName(userId, name);
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
 * The returned entry may have a null `exerciseId`: an exercise the user has
 * never programmed or logged exists in their library but has no row of its own
 * yet. Read callers should treat that as "no history", and write callers should
 * call `exerciseIdFor` to bring the row into being.
 */
export async function resolveExerciseStrict(
  userId: number,
  name: string,
): Promise<ExerciseRef> {
  const trimmed = name.trim();

  const found = await findByName(userId, trimmed);
  if (found) {
    return found;
  }

  throw new ExerciseNotFoundError(trimmed, await suggestExercises(userId, trimmed));
}

/**
 * The `Exercise.id` to attach a write to, materialising the row if this is the
 * first time the user has used this exercise.
 *
 * Kept separate from resolution on purpose: reading the library must never
 * litter an account with rows for exercises merely looked at.
 */
export async function exerciseIdFor(
  userId: number,
  entry: ExerciseRef,
): Promise<number> {
  if (entry.exerciseId !== null) return entry.exerciseId;
  if (entry.slug.startsWith("custom:")) {
    // A personal addition always has a row - it is the row.
    throw new Error(`Personal exercise "${entry.name}" has no id.`);
  }
  return materialise(userId, entry.slug);
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
  const needle = name.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const library = await resolveLibrary(userId);

  const contains = library.filter((e) => e.name.toLowerCase().includes(needle));
  if (contains.length > 0) {
    return contains.slice(0, limit);
  }

  // Nothing contains the whole string, so try its longest word - this is what
  // turns "Incline Barbell Bench" into the Bench Press family.
  const longestWord = needle
    .split(/\s+/)
    .sort((a, b) => b.length - a.length)[0];
  if (!longestWord || longestWord.length < 3 || longestWord === needle) {
    return [];
  }

  return library
    .filter((e) => e.name.toLowerCase().includes(longestWord))
    .slice(0, limit);
}

/**
 * One exercise row by id, or null if it does not exist **or belongs to someone
 * else**. Ownership is part of the lookup, not a separate check a caller can
 * forget.
 */
export async function getExercise(userId: number, id: number) {
  return prisma.exercise.findFirst({
    where: { id, userId },
    include: { catalog: true },
  });
}

/**
 * Applies a validated patch to one of this user's exercise rows.
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
    select: { id: true, name: true, catalogSlug: true },
  });
  if (!owned) {
    return null;
  }

  // Writing any field has to set `name` as well, or the read rule keeps
  // inheriting from the catalog and the edit silently does nothing.
  const patch =
    owned.name === null && owned.catalogSlug
      ? { ...data, name: (await prisma.exerciseCatalog.findUnique({
          where: { slug: owned.catalogSlug },
          select: { name: true },
        }))?.name }
      : data;

  return prisma.exercise.update({ where: { id }, data: patch });
}

/**
 * The library, optionally filtered by a case-insensitive substring on the name.
 * Used by the MCP `list_exercises` tool.
 */
export async function listExercises(
  userId: number,
  { search, limit }: { search?: string; limit: number },
) {
  const library = await resolveLibrary(userId);
  const needle = search?.trim().toLowerCase();

  return library
    .filter((e) => !needle || e.name.toLowerCase().includes(needle))
    .slice(0, limit)
    .map((e) => ({
      name: e.name,
      musclesPrimary: e.musclesPrimary,
      musclesSecondary: e.musclesSecondary,
    }));
}
