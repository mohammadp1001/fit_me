/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import {
  getBodyWeight,
  getCoachMemory,
  getExerciseHistory,
  getProgram,
  getProgressSummary,
  getVolume,
  listExercises,
  listPrograms,
  validateProgramYaml,
  LIMITS,
} from "./read-tools";
import {
  AmbiguousExerciseError,
  ExerciseNotFoundError,
  findExerciseByName,
  resolveExerciseStrict,
} from "@/lib/exercise-lookup";

/**
 * The bulk of #53's coverage, against a real Postgres.
 *
 * These functions are what the chatbot actually reads, so the assertions are
 * about the numbers and the refusals - not about the MCP plumbing, which
 * `lib/mcp/server.test.ts` covers separately.
 */

const prisma = new PrismaClient();

const TAG = `mcp-read-${Date.now()}`;
let benchId: number;
let squatId: number;
let programId: number;

/** Deterministic "today" so window arithmetic is not clock-dependent. */
const NOW = new Date("2026-08-17T10:00:00.000Z");

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return new Date(d.toISOString().slice(0, 10));
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
  });

  // Body weight and "which program is active" are single-user global state, so
  // this suite has to own them outright rather than assert around whatever else
  // happens to be in the database. `maxWorkers: 1` (jest.config.js) is what
  // makes that safe - DB suites already share the id=1 rows and run serially.
  await prisma.bodyWeight.deleteMany({ where: { userId: 1 } });
  await prisma.program.updateMany({
    where: { userId: 1, isActive: true },
    data: { isActive: false },
  });

  const bench = await prisma.exercise.create({
    data: {
      nameFa: `پرس سینه ${TAG}`,
      nameEn: `Bench Press ${TAG}`,
      musclesPrimary: ["pec_major_sternal"],
      musclesSecondary: ["triceps_brachii"],
    },
  });
  benchId = bench.id;

  const squat = await prisma.exercise.create({
    data: {
      nameFa: `اسکوات ${TAG}`,
      nameEn: `Squat ${TAG}`,
      musclesPrimary: ["quadriceps"],
      musclesSecondary: ["glute_max"],
    },
  });
  squatId = squat.id;

  const program = await prisma.program.create({
    data: {
      userId: 1,
      nameFa: `برنامه ${TAG}`,
      nameEn: `Program ${TAG}`,
      yamlContent: "",
      isActive: true,
      days: {
        create: [{ dayNumber: 1, nameFa: "روز ۱", nameEn: "Day 1" }],
      },
    },
    include: { days: true },
  });
  programId = program.id;

  await prisma.programExercise.createMany({
    data: [
      {
        dayId: program.days[0].id,
        exerciseId: benchId,
        setsCount: 3,
        reps: [8, 8, 8],
        displayOrder: 0,
        supersetGroup: "A",
      },
      {
        dayId: program.days[0].id,
        exerciseId: squatId,
        setsCount: 3,
        reps: [5, 5, 5],
        displayOrder: 1,
        supersetGroup: "A",
      },
    ],
  });

  // Bench progresses 60 -> 65 over four weekly sessions.
  const benchSessions: Array<[number, number]> = [
    [28, 60],
    [21, 62.5],
    [14, 62.5],
    [7, 65],
  ];
  for (const [ago, weight] of benchSessions) {
    await prisma.workoutLog.create({
      data: {
        userId: 1,
        exerciseId: benchId,
        date: daysAgo(ago),
        sets: [
          { weight, reps: 8 },
          { weight, reps: 8 },
        ],
      },
    });
  }

  // Squat is flat: the last three sessions beat nothing earlier.
  for (const ago of [28, 21, 14, 3]) {
    await prisma.workoutLog.create({
      data: {
        userId: 1,
        exerciseId: squatId,
        date: daysAgo(ago),
        sets: [{ weight: 100, reps: 5 }],
      },
    });
  }

  for (const [ago, kg] of [
    [28, 82],
    [21, 81.5],
    [14, 81],
    [7, 80.5],
  ] as Array<[number, number]>) {
    await prisma.bodyWeight.create({
      data: { userId: 1, weightKg: kg, date: daysAgo(ago) },
    });
  }

  await prisma.exerciseMemory.create({
    data: { exerciseId: benchId, notes: "Stalls around week three." },
  });
  await prisma.globalMemory.upsert({
    where: { id: 1 },
    update: { notes: "Prefers 6-10 reps." },
    create: { id: 1, notes: "Prefers 6-10 reps." },
  });
});

afterAll(async () => {
  await prisma.workoutLog.deleteMany({
    where: { exerciseId: { in: [benchId, squatId] } },
  });
  await prisma.exerciseMemory.deleteMany({
    where: { exerciseId: { in: [benchId, squatId] } },
  });
  await prisma.bodyWeight.deleteMany({ where: { userId: 1 } });
  await prisma.program.deleteMany({ where: { id: programId } });
  await prisma.exercise.deleteMany({ where: { id: { in: [benchId, squatId] } } });
  await prisma.$disconnect();
});

describe("exercise name resolution", () => {
  it("resolves by Persian name", async () => {
    const found = await resolveExerciseStrict(`پرس سینه ${TAG}`);
    expect(found.id).toBe(benchId);
  });

  it("resolves by English name", async () => {
    const found = await resolveExerciseStrict(`Bench Press ${TAG}`);
    expect(found.id).toBe(benchId);
  });

  it("trims surrounding whitespace", async () => {
    const found = await resolveExerciseStrict(`  Bench Press ${TAG}  `);
    expect(found.id).toBe(benchId);
  });

  it("refuses an unknown name and creates nothing", async () => {
    // The whole point of the strict resolver: a hallucinated name must never
    // mint a library row that then competes with the real one on every upload.
    const before = await prisma.exercise.count();

    await expect(resolveExerciseStrict("Completely Invented Lift")).rejects.toThrow(
      ExerciseNotFoundError,
    );

    expect(await prisma.exercise.count()).toBe(before);
  });

  it("suggests near-matches so the model can correct itself", async () => {
    await expect(resolveExerciseStrict(`Bench Press ${TAG} Extra`)).rejects.toThrow(
      /Did you mean/,
    );
  });

  it("refuses an ambiguous English name rather than guessing", async () => {
    // `nameEn` is not unique. Silently returning the lowest id would report
    // another lift's numbers as this one's.
    const dupA = await prisma.exercise.create({
      data: {
        nameFa: `ابهام الف ${TAG}`,
        nameEn: `Ambiguous ${TAG}`,
        musclesPrimary: ["lats"],
      },
    });
    const dupB = await prisma.exercise.create({
      data: {
        nameFa: `ابهام ب ${TAG}`,
        nameEn: `Ambiguous ${TAG}`,
        musclesPrimary: ["lats"],
      },
    });

    try {
      await expect(resolveExerciseStrict(`Ambiguous ${TAG}`)).rejects.toThrow(
        AmbiguousExerciseError,
      );

      // The lenient lookup still resolves, because an upload rebinding an
      // existing program needs a deterministic answer. The two behaviours are
      // different on purpose.
      const lenient = await findExerciseByName(`Ambiguous ${TAG}`);
      expect(lenient?.id).toBe(dupA.id);
    } finally {
      await prisma.exercise.deleteMany({ where: { id: { in: [dupA.id, dupB.id] } } });
    }
  });

  it("prefers an exact Persian hit over an ambiguous English one", async () => {
    const dup = await prisma.exercise.create({
      data: {
        nameFa: `یکتا ${TAG}`,
        nameEn: `Bench Press ${TAG}`,
        musclesPrimary: ["lats"],
      },
    });

    try {
      // `Bench Press ${TAG}` is now ambiguous, but the Persian name is unique.
      const found = await resolveExerciseStrict(`یکتا ${TAG}`);
      expect(found.id).toBe(dup.id);
    } finally {
      await prisma.exercise.delete({ where: { id: dup.id } });
    }
  });
});

describe("getProgressSummary", () => {
  it("reports the window it used", async () => {
    const summary = await getProgressSummary({ weeks: 8, now: NOW });

    expect(summary.window).toMatchObject({ weeks: 8, to: "2026-08-17" });
    expect(summary.window.from).toBe("2026-06-22");
  });

  it("summarises a progressing lift", async () => {
    const summary = await getProgressSummary({ weeks: 8, now: NOW });
    const bench = summary.exercises.find((e) => e.nameEn === `Bench Press ${TAG}`);

    expect(bench).toBeDefined();
    expect(bench!.sessions).toBe(4);
    expect(bench!.hardSets).toBe(8);
    expect(bench!.bestSet).toMatchObject({ weightKg: 65, reps: 8 });
    expect(bench!.oneRepMaxChange).toBeGreaterThan(0);
    expect(bench!.stalled).toBe(false);
  });

  it("flags a stalled lift", async () => {
    const summary = await getProgressSummary({ weeks: 8, now: NOW });
    const squat = summary.exercises.find((e) => e.nameEn === `Squat ${TAG}`);

    expect(squat!.stalled).toBe(true);
    expect(squat!.oneRepMaxChange).toBe(0);
  });

  it("carries both names for every exercise", async () => {
    const summary = await getProgressSummary({ weeks: 8, now: NOW });

    for (const exercise of summary.exercises) {
      expect(exercise.nameFa).toEqual(expect.any(String));
      expect(exercise.nameEn).toEqual(expect.any(String));
    }
  });

  it("returns no raw sets", async () => {
    // The summary exists so the model does not have to read every set. If raw
    // sets leak back in, the context cost this tool was built to avoid returns.
    const summary = await getProgressSummary({ weeks: 8, now: NOW });

    expect(JSON.stringify(summary)).not.toContain('"reps":8,"weight"');
    for (const exercise of summary.exercises) {
      expect(exercise).not.toHaveProperty("sets");
    }
  });

  it("excludes sessions outside the window", async () => {
    const narrow = await getProgressSummary({ weeks: 2, now: NOW });
    const bench = narrow.exercises.find((e) => e.nameEn === `Bench Press ${TAG}`);

    // Only the 7-day-ago session falls inside a 2-week window ending today.
    expect(bench!.sessions).toBe(2);
  });

  it("reports the body-weight trend as a loss", async () => {
    const summary = await getProgressSummary({ weeks: 8, now: NOW });

    expect(summary.bodyWeight.startKg).toBe(82);
    expect(summary.bodyWeight.latestKg).toBe(80.5);
    expect(summary.bodyWeight.trendKgPerWeek).toBeLessThan(0);
  });

  it("keeps volume on a 7-day window regardless of the summary window", async () => {
    // The 10/20-set landmarks are weekly figures, so widening this with the
    // summary window would make every verdict meaningless.
    const summary = await getProgressSummary({ weeks: 8, now: NOW });

    expect(summary.volume.windowDays).toBe(7);
    expect(summary.volume.landmarks).toEqual({ low: 10, high: 20 });
  });
});

describe("getExerciseHistory", () => {
  it("returns raw sets newest first", async () => {
    const history = await getExerciseHistory({ name: `Bench Press ${TAG}` });

    expect(history.exercise.nameEn).toBe(`Bench Press ${TAG}`);
    expect(history.returned).toBe(4);
    expect(history.sessions[0].date).toBe(daysAgo(7).toISOString().slice(0, 10));
    expect(history.sessions[0].sets).toEqual([
      { weight: 65, reps: 8 },
      { weight: 65, reps: 8 },
    ]);
  });

  it("honours a limit", async () => {
    const history = await getExerciseHistory({ name: `Bench Press ${TAG}`, limit: 2 });

    expect(history.returned).toBe(2);
  });

  it("caps an absurd limit rather than returning everything", async () => {
    const history = await getExerciseHistory({
      name: `Bench Press ${TAG}`,
      limit: 100_000,
    });

    expect(history.limit).toBe(LIMITS.exerciseHistory);
  });

  it("refuses an unknown exercise", async () => {
    await expect(getExerciseHistory({ name: "Nope" })).rejects.toThrow(
      ExerciseNotFoundError,
    );
  });
});

describe("getVolume", () => {
  it("credits primary at full weight and secondary at half", async () => {
    // Volume aggregates every exercise the user logged, so absolute totals
    // depend on whatever else is in the database. Assert the *delta* from one
    // known set instead - that isolates the weighting rule under test.
    const totals = async () =>
      Object.fromEntries(
        (await getVolume({ now: NOW })).byGroup.map((g) => [g.group, g.sets]),
      ) as Record<string, number>;

    const before = await totals();

    const log = await prisma.workoutLog.create({
      data: {
        userId: 1,
        exerciseId: squatId,
        date: daysAgo(1),
        sets: [{ weight: 100, reps: 5 }],
      },
    });

    try {
      const after = await totals();

      // Quads are primary on this exercise (weight 1.0), glutes secondary (0.5).
      expect(after.quads - before.quads).toBe(1);
      expect(after.glutes - before.glutes).toBe(0.5);
      // Untouched groups must not move.
      expect(after.chest - before.chest).toBe(0);
    } finally {
      await prisma.workoutLog.delete({ where: { id: log.id } });
    }
  });

  it("reports the fixed 7-day window", async () => {
    const volume = await getVolume({ now: NOW });

    expect(volume.windowDays).toBe(7);
    expect(volume.landmarks).toEqual({ low: 10, high: 20 });
  });

  it("labels each group in both languages with a verdict", async () => {
    const volume = await getVolume({ now: NOW });

    for (const group of volume.byGroup) {
      expect(group.labelEn).toEqual(expect.any(String));
      expect(group.labelFa).toEqual(expect.any(String));
      expect(["low", "adequate", "high"]).toContain(group.verdict);
    }
  });
});

describe("getBodyWeight", () => {
  it("returns entries oldest first with a trend", async () => {
    const result = await getBodyWeight();

    expect(result.entries[0].weightKg).toBe(82);
    expect(result.entries[result.entries.length - 1].weightKg).toBe(80.5);
    expect(result.trendKgPerWeek).toBeLessThan(0);
  });

  it("filters by date range", async () => {
    const result = await getBodyWeight({
      from: daysAgo(15).toISOString().slice(0, 10),
    });

    expect(result.returned).toBe(2);
  });
});

describe("getCoachMemory", () => {
  it("returns global and per-exercise notes", async () => {
    const memory = await getCoachMemory();

    expect(memory.global).toBe("Prefers 6-10 reps.");
    const bench = memory.exercises.find((e) => e.nameEn === `Bench Press ${TAG}`);
    expect(bench?.notes).toBe("Stalls around week three.");
  });

  it("narrows to one exercise", async () => {
    const memory = await getCoachMemory({ name: `Bench Press ${TAG}` });

    expect(memory.exercises).toHaveLength(1);
    expect(memory.exercises[0].nameFa).toBe(`پرس سینه ${TAG}`);
  });

  it("reports null rather than failing for an exercise with no notes", async () => {
    const memory = await getCoachMemory({ name: `Squat ${TAG}` });

    expect(memory.exercises[0].notes).toBeNull();
  });
});

describe("listPrograms and getProgram", () => {
  it("lists programs with their day counts", async () => {
    const { programs } = await listPrograms();
    const mine = programs.find((p) => p.id === programId);

    expect(mine).toMatchObject({ isActive: true, days: 1 });
  });

  it("returns the active program by default", async () => {
    const program = await getProgram();

    expect(program.id).toBe(programId);
    expect(program.days[0].exercises).toHaveLength(2);
  });

  it("exposes superset grouping", async () => {
    const program = await getProgram({ id: programId });
    const groups = program.days[0].exercises.map((e) => e.supersetGroup);

    expect(groups).toEqual(["A", "A"]);
  });

  it("throws a readable error for a missing program", async () => {
    await expect(getProgram({ id: 999_999 })).rejects.toThrow(/No program with id/);
  });
});

describe("listExercises", () => {
  it("filters case-insensitively on either name", async () => {
    const result = await listExercises({ search: `bench press ${TAG}`.toUpperCase() });

    expect(result.exercises.some((e) => e.nameEn === `Bench Press ${TAG}`)).toBe(true);
  });

  it("caps the limit", async () => {
    const result = await listExercises({ limit: 100_000 });

    expect(result.returned).toBeLessThanOrEqual(LIMITS.exercises);
  });
});

describe("validateProgramYaml", () => {
  // Note the top-level `program:` wrapper. A document without it is rejected,
  // which is exactly the mistake this tool exists to catch before upload.
  const VALID = `
program:
  name: Test Program
  days:
    - name: Day 1
      exercises:
        - name: Bench Press
          muscles:
            primary: [pec_major_sternal]
            secondary: [triceps_brachii]
          sets: 3
          reps: 8
`;

  it("accepts a valid program and writes nothing", async () => {
    const before = await prisma.program.count();

    const result = await validateProgramYaml({ yaml: VALID });

    expect(result.valid).toBe(true);
    expect(await prisma.program.count()).toBe(before);
  });

  it("summarises what it parsed", async () => {
    const result = await validateProgramYaml({ yaml: VALID });

    if (!result.valid) throw new Error("expected valid");
    expect(result.program.totalExercises).toBe(1);
    expect(result.program.days).toHaveLength(1);
  });

  it("reports an invented muscle name instead of throwing", async () => {
    // This is the failure the tool exists to catch before the user hits upload.
    const result = await validateProgramYaml({
      yaml: VALID.replace("pec_major_sternal", "pecs"),
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.error).toEqual(expect.any(String));
  });

  it("reports malformed YAML instead of throwing", async () => {
    const result = await validateProgramYaml({ yaml: "name: [unclosed" });

    expect(result.valid).toBe(false);
  });

  it("rejects a document missing the top-level program key", async () => {
    const result = await validateProgramYaml({
      yaml: VALID.replace("program:\n", "").replace(/^  /gm, ""),
    });

    expect(result.valid).toBe(false);
  });
});
