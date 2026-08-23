import {
  addPersonal,
  countPersonal,
  customSlug,
  findByName,
} from "@/lib/db/library";
import { ALL_MUSCLES } from "@/lib/muscles";
import type { Muscle } from "@prisma/client";

/**
 * `add_exercise` - creates an exercise in the calling account's own library.
 *
 * It cannot write to the shared catalog, under any input. That is deliberate
 * and mirrors a decision already made once in this codebase: the muscle
 * vocabulary is closed because free text produced synonym collisions and
 * pseudo-anatomy that made volume aggregation meaningless. The thing calling
 * this tool is a language model, and a shared catalog with no review step means
 * one bad session pollutes every account permanently.
 *
 * Promoting a good private exercise into the catalog stays a manual, human
 * step - a catalog change ships as a code change, like the muscle enum.
 *
 * The MCP client asks the user to approve each tool call, and that prompt is
 * the intended approval screen. But "always allow" removes it silently, so
 * every guard below is enforced here too.
 */

export class AddExerciseRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddExerciseRejected";
  }
}

export interface AddExerciseInput {
  userId: number;
  name: string;
  musclesPrimary: string[];
  musclesSecondary?: string[];
  description?: string;
  videoUrl?: string;
}

const NAME_MAX = 80;
const DESCRIPTION_MAX = 2000;

/**
 * A ceiling on private additions.
 *
 * Not a security boundary - the tool already cannot touch the catalog. It is a
 * guard against a model in a retry loop quietly filling a library with hundreds
 * of near-duplicates, which is the realistic failure here.
 */
export const PERSONAL_EXERCISE_CAP = 200;

function checkMuscles(values: string[], role: string): Muscle[] {
  const valid = new Set<string>(ALL_MUSCLES);
  const bad = values.filter((v) => !valid.has(v));
  if (bad.length > 0) {
    throw new AddExerciseRejected(
      `Unknown ${role} muscle: ${bad.map((b) => `"${b}"`).join(", ")}. ` +
        `Muscles come from a fixed list - call get_program_schema for it. ` +
        `Invented names are rejected because they make volume aggregation meaningless.`,
    );
  }
  return values as Muscle[];
}

export async function addExercise({
  userId,
  name,
  musclesPrimary,
  musclesSecondary = [],
  description = "",
  videoUrl = "",
}: AddExerciseInput) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new AddExerciseRejected("An exercise needs a name.");
  }
  if (trimmed.length > NAME_MAX) {
    throw new AddExerciseRejected(
      `Name is too long (${trimmed.length} characters, max ${NAME_MAX}).`,
    );
  }
  if (description.length > DESCRIPTION_MAX) {
    throw new AddExerciseRejected(
      `Description is too long (${description.length} characters, max ${DESCRIPTION_MAX}).`,
    );
  }

  // An exercise with no primary mover cannot contribute to volume, so it would
  // be dead weight in the library.
  if (musclesPrimary.length === 0) {
    throw new AddExerciseRejected(
      "An exercise needs at least one primary muscle - without one it counts toward no volume at all.",
    );
  }

  const primary = checkMuscles(musclesPrimary, "primary");
  const secondary = checkMuscles(musclesSecondary, "secondary").filter(
    (m) => !primary.includes(m),
  );

  // Creating a second exercise of the same name would make every later lookup
  // ambiguous, and the caller almost certainly means the one that exists.
  const existing = await findByName(userId, trimmed);
  if (existing) {
    throw new AddExerciseRejected(
      `"${trimmed}" is already in your library as \`${existing.slug}\`. ` +
        `Use that slug instead of creating a second one.`,
    );
  }

  if ((await countPersonal(userId)) >= PERSONAL_EXERCISE_CAP) {
    throw new AddExerciseRejected(
      `You already have ${PERSONAL_EXERCISE_CAP} exercises of your own. ` +
        `Reuse an existing one, or remove some before adding more.`,
    );
  }

  const exerciseId = await addPersonal(userId, {
    name: trimmed,
    musclesPrimary: primary,
    musclesSecondary: secondary,
    description: description.trim(),
    videoUrl: videoUrl.trim(),
  });

  return {
    // The slug a program file can reference immediately.
    slug: customSlug(exerciseId),
    name: trimmed,
    musclesPrimary: primary,
    musclesSecondary: secondary,
    scope: "personal" as const,
    note: "Added to your library only. The shared catalog is unchanged.",
  };
}

