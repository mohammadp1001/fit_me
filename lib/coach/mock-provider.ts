import type { CoachProvider } from "./provider";

/**
 * Deterministic fake `CoachProvider` used for tests and local development.
 * It never makes a network call and requires no API key.
 *
 * The response is derived purely from the prompt text so tests can assert
 * on stable output. It looks for a "Sets required: N" line (written by
 * `buildCoachPrompt`) to determine how many sets to return.
 */
export class MockCoachProvider implements CoachProvider {
  async complete(prompt: string): Promise<string> {
    const setsMatch = prompt.match(/Sets required:\s*(\d+)/);
    const setsCount = setsMatch ? parseInt(setsMatch[1], 10) : 3;

    const sets = Array.from({ length: setsCount }, () => ({
      weight: 20,
      reps: 10,
    }));

    return JSON.stringify({
      sets,
      rationale: "Mock suggestion: maintain weight and reps from the prescribed target.",
      updatedExerciseMemory: "Mock exercise memory update.",
      updatedGlobalMemory: "Mock global memory update.",
    });
  }
}

/**
 * A `CoachProvider` that always returns malformed/invalid content, for
 * exercising `generateSuggestion`'s error handling in tests.
 */
export class BrokenJsonCoachProvider implements CoachProvider {
  async complete(): Promise<string> {
    return "this is not valid json {{{";
  }
}

/**
 * A `CoachProvider` whose response is valid JSON but does not satisfy the
 * output schema (e.g. wrong number of sets), for exercising validation.
 */
export class InvalidShapeCoachProvider implements CoachProvider {
  constructor(private readonly setsCount: number) {}

  async complete(): Promise<string> {
    return JSON.stringify({
      sets: Array.from({ length: this.setsCount }, () => ({
        weight: 20,
        reps: 10,
      })),
      rationale: "Wrong number of sets on purpose.",
      updatedExerciseMemory: "n/a",
      updatedGlobalMemory: "n/a",
    });
  }
}
