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
  musclesPrimary: ["quadriceps", "glute_max"],
  musclesSecondary: ["hamstrings"],
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
        date: "2026-01-01",
        sets: [{ weight: 50, reps: 8 }],
      },
      {
        id: 2,
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

describe("buildCoachPrompt — muscles and volume", () => {
  const base = {
    exercise,
    programExercise,
    history: [],
    exerciseMemory: null,
    globalMemory: null,
  };

  it("renders primary and secondary movers under their display names", () => {
    const prompt = buildCoachPrompt(base);
    expect(prompt).toContain("Primary muscles: Quadriceps, Glute Max");
    expect(prompt).toContain("Secondary muscles: Hamstrings");
  });

  it("omits the secondary line when there are none", () => {
    const prompt = buildCoachPrompt({
      ...base,
      exercise: { ...exercise, musclesSecondary: [] },
    });
    expect(prompt).not.toContain("Secondary muscles:");
  });

  it("includes the volume block with a verdict per group", () => {
    const prompt = buildCoachPrompt({
      ...base,
      groupVolume: [
        { group: "back", sets: 18.5, verdict: "high" },
        { group: "arms", sets: 9, verdict: "low" },
      ],
    });
    expect(prompt).toContain("Back: 18.5 hard sets - above the 20-set ceiling");
    expect(prompt).toContain("Arms: 9 hard sets - below the 10-set floor");
  });

  it("omits the volume block entirely when no volume is supplied", () => {
    expect(buildCoachPrompt(base)).not.toContain("Weekly volume");
  });
});
