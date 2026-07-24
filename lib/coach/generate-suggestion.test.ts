import { generateSuggestion } from "./generate-suggestion";
import {
  MockCoachProvider,
  BrokenJsonCoachProvider,
  InvalidShapeCoachProvider,
} from "./mock-provider";
import type {
  CoachExercise,
  CoachProgramExercise,
  CoachWorkoutLog,
  GenerateSuggestionInput,
} from "./types";

const exercise: CoachExercise = {
  id: 1,
  nameFa: "پرس سینه",
  nameEn: "Bench Press",
  muscles: ["Chest", "Triceps"],
  descriptionEn: "Flat barbell bench press.",
};

const programExercise: CoachProgramExercise = {
  id: 10,
  exerciseId: 1,
  setsCount: 3,
  reps: [10, 8, 8],
};

const history: CoachWorkoutLog[] = [
  {
    id: 100,
    programExerciseId: 10,
    date: "2026-07-01",
    sets: [
      { weight: 40, reps: 10 },
      { weight: 40, reps: 9 },
      { weight: 40, reps: 8 },
    ],
  },
  {
    id: 101,
    programExerciseId: 10,
    date: "2026-07-08",
    sets: [
      { weight: 42.5, reps: 10 },
      { weight: 42.5, reps: 10 },
      { weight: 42.5, reps: 9 },
    ],
  },
];

function baseInput(
  overrides: Partial<GenerateSuggestionInput> = {},
): GenerateSuggestionInput {
  return {
    exercise,
    programExercise,
    history,
    exerciseMemory: "Progressing steadily on this lift.",
    globalMemory: "User tolerates high volume well.",
    ...overrides,
  };
}

describe("generateSuggestion", () => {
  it("returns a valid suggestion matching the schema and setsCount", async () => {
    const provider = new MockCoachProvider();
    const result = await generateSuggestion(baseInput(), provider);

    expect(result.sets).toHaveLength(programExercise.setsCount);
    for (const set of result.sets) {
      expect(typeof set.weight === "number" || set.weight === null).toBe(
        true,
      );
      expect(typeof set.reps === "number" || set.reps === null).toBe(true);
    }
    expect(typeof result.rationale).toBe("string");
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(typeof result.updatedExerciseMemory).toBe("string");
    expect(typeof result.updatedGlobalMemory).toBe("string");
  });

  it("is deterministic for the mock provider given the same input", async () => {
    const provider = new MockCoachProvider();
    const result1 = await generateSuggestion(baseInput(), provider);
    const result2 = await generateSuggestion(baseInput(), provider);
    expect(result1).toEqual(result2);
  });

  it("adapts the number of sets to programExercise.setsCount", async () => {
    const provider = new MockCoachProvider();
    const input = baseInput({
      programExercise: { ...programExercise, setsCount: 5 },
    });
    const result = await generateSuggestion(input, provider);
    expect(result.sets).toHaveLength(5);
  });

  it("rejects malformed/invalid JSON from the provider", async () => {
    const provider = new BrokenJsonCoachProvider();
    await expect(generateSuggestion(baseInput(), provider)).rejects.toThrow(
      /malformed JSON/i,
    );
  });

  it("rejects a response whose sets length does not match setsCount", async () => {
    const provider = new InvalidShapeCoachProvider(
      programExercise.setsCount + 1,
    );
    await expect(generateSuggestion(baseInput(), provider)).rejects.toThrow(
      /setsCount|sets but the program prescribes/i,
    );
  });

  it("rejects a response missing required schema fields", async () => {
    const provider = {
      complete: async () =>
        JSON.stringify({ sets: [{ weight: 1, reps: 1 }] }), // missing rationale/memory fields
    };
    await expect(
      generateSuggestion(
        baseInput({ programExercise: { ...programExercise, setsCount: 1 } }),
        provider,
      ),
    ).rejects.toThrow(/schema/i);
  });

  it("handles cold start: empty history and null memory", async () => {
    const provider = new MockCoachProvider();
    const input = baseInput({
      history: [],
      exerciseMemory: null,
      globalMemory: null,
    });
    const result = await generateSuggestion(input, provider);

    expect(result.sets).toHaveLength(programExercise.setsCount);
    expect(typeof result.updatedExerciseMemory).toBe("string");
    expect(typeof result.updatedGlobalMemory).toBe("string");
  });

  it("does not require any network call or API key to run", async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const provider = new MockCoachProvider();
    await expect(
      generateSuggestion(baseInput(), provider),
    ).resolves.toBeDefined();
  });
});
