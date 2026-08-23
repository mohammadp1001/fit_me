import {
  discardDraft,
  findDraft,
  installProgram,
  UnknownExerciseSlugError,
} from "@/lib/db/programs";
import { parseWorkoutYaml } from "@/lib/yaml-parser";

/**
 * `save_program_draft` - saves a proposed program as an inactive draft.
 *
 * The user's current program keeps running, untouched, until they approve the
 * draft in the app. That is the whole point of the tool, not a limitation of
 * it: a per-date suggestion expires in a day, but a bad program costs a month.
 * A tool that activated directly would let a hallucinated file replace a split
 * mid-block, with no moment where a human looked at it.
 *
 * There is deliberately no argument that activates. Approval lives in the app,
 * where the user can see what would change.
 */

export class DraftRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftRejected";
  }
}

const RATIONALE_MAX = 2000;

export interface SaveProgramDraftInput {
  userId: number;
  yaml: string;
  rationale: string;
  /** Required to overwrite a proposal the user has not answered yet. */
  replaceExisting?: boolean;
}

export async function saveProgramDraft({
  userId,
  yaml,
  rationale,
  replaceExisting = false,
}: SaveProgramDraftInput) {
  const why = rationale.trim();
  if (!why) {
    throw new DraftRejected(
      "A proposed program needs a rationale. The user is being asked to " +
        "replace what they are currently following, and a diff without a " +
        "reason is not something anyone can judge.",
    );
  }
  if (why.length > RATIONALE_MAX) {
    throw new DraftRejected(
      `Rationale is too long (${why.length} characters, max ${RATIONALE_MAX}).`,
    );
  }

  // Parsed before anything else so a malformed file never reaches the database
  // and never disturbs an existing draft.
  let program;
  try {
    program = parseWorkoutYaml(yaml);
  } catch (err) {
    throw new DraftRejected(
      `The program did not parse, so nothing was saved. ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Silently replacing a proposal the user has not answered yet would discard
  // work they may be part-way through considering.
  const existing = await findDraft(userId);
  if (existing && !replaceExisting) {
    throw new DraftRejected(
      `There is already a proposal waiting for the user: "${existing.name}". ` +
        `Ask them about that one first, or call again with replaceExisting: true ` +
        `to throw it away and put this in its place.`,
    );
  }

  let saved;
  try {
    saved = await installProgram(userId, program, yaml, {
      draft: true,
      rationale: why,
    });
  } catch (err) {
    if (err instanceof UnknownExerciseSlugError) {
      throw new DraftRejected(
        `${err.message} Nothing was saved, and the active program is unchanged.`,
      );
    }
    throw err;
  }

  // Only once the new one is safely stored, so a failure cannot leave the user
  // with no proposal and no program to look at.
  if (existing) {
    await discardDraft(userId, existing.id);
  }

  return {
    draftId: saved.id,
    name: saved.name,
    days: saved.days.length,
    replacedPreviousDraft: existing !== null,
    status: "awaiting approval" as const,
    note:
      "Saved as a draft. The user's active program is unchanged - they approve " +
      "or discard this in the app.",
  };
}
