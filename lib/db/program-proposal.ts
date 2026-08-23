import { findDraft, getActiveProgram } from "./programs";
import { diffPrograms, type DiffProgram, type ProgramDiff } from "@/lib/program-diff";

/**
 * The pending proposal and what approving it would change.
 *
 * Assembled here so the page and the API route share one copy: the comparison
 * is the substance of the approval screen, and two implementations would drift.
 */

export interface PendingProposal {
  id: number;
  name: string;
  rationale: string;
  diff: ProgramDiff;
}

type ResolvedProgram = NonNullable<Awaited<ReturnType<typeof findDraft>>>;

function toDiffProgram(program: ResolvedProgram): DiffProgram {
  return {
    name: program.name,
    days: program.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((slot) => ({
        exerciseId: slot.exerciseId,
        // Already resolved by the data layer - an inherited row carries no name
        // of its own.
        name: slot.exercise.name,
        sets: slot.setsCount,
        reps: slot.reps,
        note: slot.note,
      })),
    })),
  };
}

export async function getPendingProposal(
  userId: number,
): Promise<PendingProposal | null> {
  const draft = await findDraft(userId);
  if (!draft) return null;

  const active = await getActiveProgram(userId);

  return {
    id: draft.id,
    name: draft.name,
    rationale: draft.rationale,
    diff: diffPrograms(active ? toDiffProgram(active) : null, toDiffProgram(draft)),
  };
}
