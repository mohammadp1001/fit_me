import { diffPrograms, type DiffProgram } from "./program-diff";

const ex = (
  exerciseId: number,
  name: string,
  sets: number,
  reps: number[],
  note = "",
) => ({ exerciseId, name, sets, reps, note });

const program = (name: string, days: DiffProgram["days"]): DiffProgram => ({
  name,
  days,
});

const SQUAT = ex(1, "Barbell Squat", 3, [10, 10, 10]);
const BENCH = ex(2, "Bench Press", 4, [8, 8, 8, 8]);
const ROW = ex(3, "Barbell Row", 3, [12, 12, 12]);

describe("diffPrograms", () => {
  it("reports nothing when the programs match", () => {
    const p = program("Block A", [{ name: "Day 1", exercises: [SQUAT, BENCH] }]);
    const diff = diffPrograms(p, p);

    expect(diff.identical).toBe(true);
    expect(diff.totals).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 2 });
  });

  it("marks a new exercise as added", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [SQUAT] }]),
      program("Block A", [{ name: "Day 1", exercises: [SQUAT, BENCH] }]),
    );

    expect(diff.identical).toBe(false);
    expect(diff.totals.added).toBe(1);
    expect(diff.days[0].exercises).toContainEqual({
      kind: "added",
      name: "Bench Press",
      sets: 4,
      reps: [8, 8, 8, 8],
      note: "",
    });
  });

  it("marks a dropped exercise as removed, and lists it last", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [SQUAT, BENCH] }]),
      program("Block A", [{ name: "Day 1", exercises: [SQUAT] }]),
    );

    expect(diff.totals.removed).toBe(1);
    // "What am I losing?" only makes sense once you can see what you are getting.
    const kinds = diff.days[0].exercises.map((c) => c.kind);
    expect(kinds[kinds.length - 1]).toBe("removed");
  });

  it("shows sets and reps moving, from and to", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [SQUAT] }]),
      program("Block A", [
        { name: "Day 1", exercises: [ex(1, "Barbell Squat", 4, [8, 8, 6, 6], "Heavier.")] },
      ]),
    );

    expect(diff.totals.changed).toBe(1);
    expect(diff.days[0].exercises[0]).toEqual({
      kind: "changed",
      name: "Barbell Squat",
      from: { sets: 3, reps: [10, 10, 10] },
      to: { sets: 4, reps: [8, 8, 6, 6] },
      note: "Heavier.",
    });
  });

  // The lift is the durable thing, not the name it happened to be shown under.
  it("compares by exercise, not by display name", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [ex(1, "Squat", 3, [10]) ] }]),
      program("Block A", [
        { name: "Day 1", exercises: [ex(1, "Barbell Back Squat", 3, [10])] },
      ]),
    );

    expect(diff.totals.unchanged).toBe(1);
    expect(diff.totals.added).toBe(0);
  });
});

describe("diffPrograms - days", () => {
  it("pairs days by name even when they are reordered", () => {
    const diff = diffPrograms(
      program("Block A", [
        { name: "Push", exercises: [BENCH] },
        { name: "Pull", exercises: [ROW] },
      ]),
      program("Block A", [
        { name: "Pull", exercises: [ROW] },
        { name: "Push", exercises: [BENCH] },
      ]),
    );

    // Reordering a split must not read as two removals and two additions.
    expect(diff.totals).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 2 });
    expect(diff.days.map((d) => d.kind)).toEqual(["unchanged", "unchanged"]);
  });

  it("reads a renamed day as a rename, not an add and a remove", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [SQUAT] }]),
      program("Block A", [{ name: "Leg Day", exercises: [SQUAT] }]),
    );

    expect(diff.days).toHaveLength(1);
    expect(diff.days[0]).toMatchObject({
      name: "Leg Day",
      previousName: "Day 1",
      kind: "changed",
    });
    expect(diff.totals.added).toBe(0);
    expect(diff.totals.removed).toBe(0);
    expect(diff.identical).toBe(false);
  });

  it("reports a whole new day", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Push", exercises: [BENCH] }]),
      program("Block A", [
        { name: "Push", exercises: [BENCH] },
        { name: "Pull", exercises: [ROW] },
      ]),
    );

    expect(diff.days.map((d) => d.kind)).toEqual(["unchanged", "added"]);
    expect(diff.totals.added).toBe(1);
  });

  it("reports a whole dropped day", () => {
    const diff = diffPrograms(
      program("Block A", [
        { name: "Push", exercises: [BENCH] },
        { name: "Pull", exercises: [ROW] },
      ]),
      program("Block A", [{ name: "Push", exercises: [BENCH] }]),
    );

    const dropped = diff.days.find((d) => d.kind === "removed");
    expect(dropped?.name).toBe("Pull");
    expect(diff.totals.removed).toBe(1);
  });

  it("notices a renamed program", () => {
    const diff = diffPrograms(
      program("Block A", [{ name: "Day 1", exercises: [SQUAT] }]),
      program("Block B", [{ name: "Day 1", exercises: [SQUAT] }]),
    );

    expect(diff.programName).toEqual({
      from: "Block A",
      to: "Block B",
      changed: true,
    });
    expect(diff.identical).toBe(false);
  });
});

describe("diffPrograms - no program yet", () => {
  // The honest reading for a user with nothing to compare against.
  it("treats everything as new", () => {
    const diff = diffPrograms(
      null,
      program("First", [{ name: "Day 1", exercises: [SQUAT, BENCH] }]),
    );

    expect(diff.totals.added).toBe(2);
    expect(diff.totals.removed).toBe(0);
    expect(diff.days[0].kind).toBe("added");
    expect(diff.identical).toBe(false);
    // There is no previous name to report as changed.
    expect(diff.programName.changed).toBe(false);
  });
});
