import type { CoachProvider } from "./provider";
import { buildCoachPrompt } from "./prompt";
import {
  SuggestionOutputSchema,
  type GenerateSuggestionInput,
  type SuggestionOutput,
} from "./types";

/**
 * Generates a coaching suggestion (target sets) plus revised memory for a
 * single exercise, from its history and current memory state.
 *
 * This is a pure function of its inputs plus the injected `provider` - it
 * never touches the database directly. One `provider.complete` call
 * produces both the suggestion and the revised memory together.
 *
 * @throws Error if the provider's response is not valid JSON, does not
 *   satisfy the output schema, or has a `sets` length that does not match
 *   `programExercise.setsCount`.
 */
export async function generateSuggestion(
  input: GenerateSuggestionInput,
  provider: CoachProvider,
): Promise<SuggestionOutput> {
  const prompt = buildCoachPrompt(input);
  const rawResponse = await provider.complete(prompt);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawResponse);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Coach provider returned malformed JSON that could not be parsed: ${reason}`,
    );
  }

  const result = SuggestionOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Coach provider response did not match the expected schema: ${result.error.message}`,
    );
  }

  const output = result.data;
  const expectedSetsCount = input.programExercise.setsCount;
  if (output.sets.length !== expectedSetsCount) {
    throw new Error(
      `Coach provider returned ${output.sets.length} sets but the program prescribes ${expectedSetsCount}.`,
    );
  }

  return output;
}

// Re-exported for convenience so callers can `import { ... } from "lib/coach/generate-suggestion"`.
export { SuggestionOutputSchema };
export type { GenerateSuggestionInput, SuggestionOutput };
