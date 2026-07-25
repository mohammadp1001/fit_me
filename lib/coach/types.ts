import { z } from "zod";

/**
 * Local types for the coaching "generation core".
 *
 * Prisma's Suggestion/ExerciseMemory/GlobalMemory models are being added in a
 * sibling issue (#22). Until that lands (and the Prisma-generated types are
 * available in this codebase), we define the shapes this module needs
 * locally, matching what #22 describes. These are intentionally narrow -
 * only the fields the generation core actually consumes - so swapping in the
 * real Prisma types later is a type-compatible, low-risk change.
 */

/** Subset of the Prisma `Exercise` model relevant to generating a suggestion. */
export interface CoachExercise {
  id: number;
  nameFa: string;
  nameEn: string;
  muscles: string[];
  descriptionFa?: string;
  descriptionEn?: string;
}

/** Subset of the Prisma `ProgramExercise` model relevant to generating a suggestion. */
export interface CoachProgramExercise {
  id: number;
  exerciseId: number;
  setsCount: number;
  reps: number[];
}

/** Subset of the Prisma `WorkoutLog` model relevant to generating a suggestion. */
export interface CoachWorkoutLog {
  id: number;
  programExerciseId: number;
  date: Date | string;
  sets: Array<{ weight: number | null; reps: number | null }>;
}

/** A single planned/suggested set. */
export const SuggestedSetSchema = z.object({
  weight: z.number().nullable(),
  reps: z.number().int().nullable(),
});
export type SuggestedSet = z.infer<typeof SuggestedSetSchema>;

/** The structured output contract the LLM provider must return. */
export const SuggestionOutputSchema = z.object({
  sets: z.array(SuggestedSetSchema),
  rationale: z.string(),
  updatedExerciseMemory: z.string(),
  updatedGlobalMemory: z.string(),
});
export type SuggestionOutput = z.infer<typeof SuggestionOutputSchema>;

/** Input to `generateSuggestion`. */
export interface GenerateSuggestionInput {
  exercise: CoachExercise;
  programExercise: CoachProgramExercise;
  /** History across all programs, not just the active one. */
  history: CoachWorkoutLog[];
  exerciseMemory: string | null;
  globalMemory: string | null;
}
