import { parseWorkoutYaml } from "./yaml-parser";

const program = (body: string) => `program:\n  name: "Test"\n  days:\n${body}`;

const oneDay = (exercises: string) =>
  program(`    - name: "Day 1"\n      exercises:\n${exercises}`);

describe("parseWorkoutYaml", () => {
  it("parses a program with a single rep target", () => {
    const parsed = parseWorkoutYaml(
      oneDay(`        - exercise: barbell_squat\n          sets: 3\n          reps: 10`),
    );

    expect(parsed.name).toBe("Test");
    expect(parsed.days).toHaveLength(1);
    expect(parsed.days[0].name).toBe("Day 1");
    expect(parsed.days[0].exercises[0]).toMatchObject({
      exercise: "barbell_squat",
      sets: 3,
      // A single integer expands to one target per set, so no reader has to
      // handle two shapes.
      reps: [10],
    });
  });

  it("parses per-set reps", () => {
    const parsed = parseWorkoutYaml(
      oneDay(
        `        - exercise: barbell_squat\n          sets: 4\n          reps: [12, 10, 8, 8]`,
      ),
    );

    expect(parsed.days[0].exercises[0].reps).toEqual([12, 10, 8, 8]);
  });

  it("parses a superset link and an optional note", () => {
    const parsed = parseWorkoutYaml(
      oneDay(
        `        - exercise: cable_crossover\n          sets: 3\n          reps: 12\n          superset_with: pushups\n          note: "Straight into pushups, no rest."\n` +
          `        - exercise: pushups\n          sets: 3\n          reps: 15\n          superset_with: cable_crossover`,
      ),
    );

    const [a, b] = parsed.days[0].exercises;
    expect(a.superset_with).toBe("pushups");
    expect(a.note).toBe("Straight into pushups, no rest.");
    expect(b.superset_with).toBe("cable_crossover");
    expect(b.note).toBeUndefined();
  });

  it("parses the shipped template", () => {
    // The template is what `get_program_schema` hands a chatbot. If it stops
    // parsing, every program the coach writes is wrong.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs");
    const parsed = parseWorkoutYaml(
      readFileSync("examples/TEMPLATE.yaml", "utf8"),
    );
    expect(parsed.days.length).toBeGreaterThan(0);
    expect(parsed.days[0].exercises[0].exercise).toMatch(/^[a-z0-9_]+$/);
  });
});

describe("parseWorkoutYaml - slugs", () => {
  it("rejects a display name where a slug belongs", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(
          `        - exercise: "Barbell Squat"\n          sets: 3\n          reps: 10`,
        ),
      ),
    ).toThrow(/slug/i);
  });

  it("rejects an empty slug", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(`        - exercise: ""\n          sets: 3\n          reps: 10`),
      ),
    ).toThrow();
  });

  // Two slots for the same lift on one day would make "which slot is this log
  // for?" ambiguous, and the suggestion writer picks the lowest displayOrder.
  it("rejects the same exercise twice in one day", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(
          `        - exercise: barbell_squat\n          sets: 3\n          reps: 10\n` +
            `        - exercise: barbell_squat\n          sets: 2\n          reps: 5`,
        ),
      ),
    ).toThrow(/appears twice/i);
  });

  it("allows the same exercise on different days", () => {
    const parsed = parseWorkoutYaml(
      program(
        `    - name: "Day 1"\n      exercises:\n        - exercise: barbell_squat\n          sets: 3\n          reps: 10\n` +
          `    - name: "Day 2"\n      exercises:\n        - exercise: barbell_squat\n          sets: 5\n          reps: 5`,
      ),
    );
    expect(parsed.days).toHaveLength(2);
  });
});

describe("parseWorkoutYaml - structure", () => {
  it("rejects a document with no top-level program object", () => {
    expect(() => parseWorkoutYaml(`name: "Test"\ndays: []`)).toThrow(
      /Invalid program YAML/,
    );
  });

  it("rejects a missing required field", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(`        - exercise: barbell_squat\n          sets: 3`),
      ),
    ).toThrow(/Invalid program YAML/);
  });

  it("rejects a non-positive set count", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(
          `        - exercise: barbell_squat\n          sets: 0\n          reps: 10`,
        ),
      ),
    ).toThrow();
  });

  // An invented key must fail loudly. Silently dropping it is how a program
  // ends up meaning something other than what its author wrote.
  it("rejects a key that is not in the schema", () => {
    expect(() =>
      parseWorkoutYaml(
        oneDay(
          `        - exercise: barbell_squat\n          sets: 3\n          reps: 10\n          tempo: "3-1-1"`,
        ),
      ),
    ).toThrow();
  });
});

describe("parseWorkoutYaml - the removed v1 keys", () => {
  // These keys were silently authoritative: a program file could re-tag an
  // exercise's muscles and corrupt the volume chart. Whoever still sends them
  // deserves to be told exactly why they are gone, not handed a generic
  // "unrecognised key".
  const withKey = (line: string) =>
    oneDay(
      `        - exercise: barbell_squat\n          sets: 3\n          reps: 10\n${line}`,
    );

  it("explains that muscles now live in the catalog", () => {
    expect(() =>
      parseWorkoutYaml(withKey(`          muscles:\n            primary: [quadriceps]`)),
    ).toThrow(/muscles now live in the exercise catalog/);
  });

  it("explains that an exercise is addressed by slug", () => {
    expect(() => parseWorkoutYaml(withKey(`          name: "Barbell Squat"`))).toThrow(
      /addressed by .exercise: <slug>./,
    );
  });

  it("explains where descriptions, tips, mistakes and video went", () => {
    expect(() => parseWorkoutYaml(withKey(`          description: "x"`))).toThrow(
      /descriptions live in the exercise catalog/,
    );
    expect(() => parseWorkoutYaml(withKey(`          tips: ["x"]`))).toThrow(
      /tips live in the exercise catalog/,
    );
    expect(() => parseWorkoutYaml(withKey(`          mistakes: ["x"]`))).toThrow(
      /mistakes live in the exercise catalog/,
    );
    expect(() => parseWorkoutYaml(withKey(`          video: "http://x"`))).toThrow(
      /video links live in the exercise catalog/,
    );
  });

  it("explains that programs and days have a single name", () => {
    expect(() =>
      parseWorkoutYaml(
        `program:\n  name: "Test"\n  name_en: "Test"\n  days:\n    - name: "Day 1"\n      exercises:\n        - exercise: barbell_squat\n          sets: 3\n          reps: 10`,
      ),
    ).toThrow(/single English .name./);

    expect(() =>
      parseWorkoutYaml(
        `program:\n  name: "Test"\n  days:\n    - name: "Day 1"\n      name_en: "Day 1"\n      exercises:\n        - exercise: barbell_squat\n          sets: 3\n          reps: 10`,
      ),
    ).toThrow(/single English .name./);
  });

  it("names the day and exercise so the author can find it", () => {
    expect(() =>
      parseWorkoutYaml(
        program(
          `    - name: "Day 1"\n      exercises:\n        - exercise: barbell_squat\n          sets: 3\n          reps: 10\n` +
            `    - name: "Day 2"\n      exercises:\n        - exercise: bench_press\n          sets: 3\n          reps: 10\n          muscles:\n            primary: [pec_major_sternal]`,
        ),
      ),
    ).toThrow(/day 2, exercise 1/);
  });
});
