import { computeInitialSets } from "./log-prefill";

describe("computeInitialSets", () => {
  it("cold start: no suggestion, no today log -> reps from programReps, weight blank", () => {
    const result = computeInitialSets({
      setsCount: 3,
      programReps: [10, 8, 6],
      suggestionSets: null,
      todaysLogSets: null,
    });

    expect(result).toEqual([
      { weight: "", reps: "10" },
      { weight: "", reps: "8" },
      { weight: "", reps: "6" },
    ]);
  });

  it("cold start: reps shorter than setsCount -> falls back to last planned rep", () => {
    const result = computeInitialSets({
      setsCount: 3,
      programReps: [10],
      suggestionSets: null,
      todaysLogSets: null,
    });

    expect(result).toEqual([
      { weight: "", reps: "10" },
      { weight: "", reps: "10" },
      { weight: "", reps: "10" },
    ]);
  });

  it("suggestion found: pre-fills weight and reps per set from the suggestion", () => {
    const result = computeInitialSets({
      setsCount: 2,
      programReps: [10, 10],
      suggestionSets: [
        { weight: 60, reps: 10 },
        { weight: 62.5, reps: 8 },
      ],
      todaysLogSets: null,
    });

    expect(result).toEqual([
      { weight: "60", reps: "10" },
      { weight: "62.5", reps: "8" },
    ]);
  });

  it("suggestion with a null reps value falls back to planned reps for that set", () => {
    const result = computeInitialSets({
      setsCount: 1,
      programReps: [12],
      suggestionSets: [{ weight: 40, reps: null }],
      todaysLogSets: null,
    });

    expect(result).toEqual([{ weight: "40", reps: "12" }]);
  });

  it("suggestion shorter than setsCount: remaining sets fall back to cold start", () => {
    const result = computeInitialSets({
      setsCount: 3,
      programReps: [10, 10, 10],
      suggestionSets: [{ weight: 60, reps: 10 }],
      todaysLogSets: null,
    });

    expect(result).toEqual([
      { weight: "60", reps: "10" },
      { weight: "", reps: "10" },
      { weight: "", reps: "10" },
    ]);
  });

  it("today's log wins over a suggestion, even if both exist", () => {
    const result = computeInitialSets({
      setsCount: 2,
      programReps: [10, 10],
      suggestionSets: [
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
      ],
      todaysLogSets: [
        { weight: "55", reps: "9" },
        { weight: "55", reps: "9" },
      ],
    });

    expect(result).toEqual([
      { weight: "55", reps: "9" },
      { weight: "55", reps: "9" },
    ]);
  });
});
