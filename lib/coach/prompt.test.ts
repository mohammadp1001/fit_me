import { buildCoachPrompt } from "./prompt";
import type {
  CoachExercise,
  CoachProgramExercise,
  CoachWorkoutLog,
} from "./types";

const exercise: CoachExercise = {
  id: 1,
  nameFa: "اسکات",
  nameEn: "Squat",
  muscles: ["Quads", "Glutes"],
};

const programExercise: CoachProgramExercise = {
  id: 5,
  exerciseId: 1,
  setsCount: 4,
  reps: [8, 8, 8, 6],
};

describe("buildCoachPrompt", () => {
  it("includes exercise, program prescription, and both memory tiers", () => {
    const prompt = buildCoachPrompt({
      exercise,
      programExercise,
      history: [],
      exerciseMemory: "Notes about this lift.",
      globalMemory: "Notes about the user.",
    });

    expect(prompt).toContain("Squat");
    expect(prompt).toContain("Sets required: 4");
    expect(prompt).toContain("Notes about this lift.");
    expect(prompt).toContain("Notes about the user.");
  });

  it("handles cold start with no history and null memory", () => {
    const prompt = buildCoachPrompt({
      exercise,
      programExercise,
      history: [],
      exerciseMemory: null,
      globalMemory: null,
    });

    expect(prompt).toContain("No prior workout history");
    expect(prompt).toContain("(none yet)");
  });

  it("includes history entries sorted most recent first", () => {
    const history: CoachWorkoutLog[] = [
      {
        id: 1,
        programExerciseId: 5,
        date: "2026-01-01",
        sets: [{ weight: 50, reps: 8 }],
      },
      {
        id: 2,
        programExerciseId: 5,
        date: "2026-06-01",
        sets: [{ weight: 60, reps: 8 }],
      },
    ];

    const prompt = buildCoachPrompt({
      exercise,
      programExercise,
      history,
      exerciseMemory: null,
      globalMemory: null,
    });

    const idxJune = prompt.indexOf("2026-06-01");
    const idxJan = prompt.indexOf("2026-01-01");
    expect(idxJune).toBeGreaterThan(-1);
    expect(idxJan).toBeGreaterThan(-1);
    expect(idxJune).toBeLessThan(idxJan);
  });
});
