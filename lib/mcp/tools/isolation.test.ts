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
} from "./read-tools";
import { saveSuggestions } from "./save-suggestions";
import { ExerciseNotFoundError } from "@/lib/db/exercises";

/**
 * One account's MCP token must not reach another account's data.
 *
 * `lib/db/isolation.test.ts` covers the data layer. This covers the surface a
 * chatbot actually calls, which is where a missing `userId` argument would
 * show up as one person's coach reading someone else's training.
 *
 * The two accounts here use **identical exercise names on purpose**. That is
 * the realistic case, not a contrived one: every account is seeded from the
 * same ~30-row template, so "Bench Press" exists in both libraries as different
 * rows. A tool that resolves a name without an owner finds the wrong row and
 * reports it confidently.
 */

const prisma = new PrismaClient();

const TAG = `mcp-iso-${Date.now()}`;
/** Deliberately the same in both libraries. */
const SHARED_FA = `پرس سینه ${TAG}`;
const SHARED_EN = `Bench Press ${TAG}`;

const NOW = new Date("2026-08-19T10:00:00.000Z");
const TOMORROW = "2026-08-20";

let alice: number;
let bob: number;
let aliceExercise: number;
let bobExercise: number;
let aliceSlot: number;
let bobSlot: number;

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return new Date(d.toISOString().slice(0, 10));
}

/** A whole account: user, one exercise, an active program, logs, notes. */
async function makeAccount(label: string, weight: number) {
  const user = await prisma.user.create({
    data: { name: label, weightKg: 80, heightCm: 180 },
  });

  const exercise = await prisma.exercise.create({
    data: {
      userId: user.id,
      nameFa: SHARED_FA,
      nameEn: SHARED_EN,
      musclesPrimary: ["pec_major_sternal"],
    },
  });

  const program = await prisma.program.create({
    data: {
      userId: user.id,
      nameFa: `برنامه ${label}`,
      nameEn: `${label} Program`,
      yamlContent: "",
      isActive: true,
      days: { create: [{ dayNumber: 1, nameFa: "روز ۱", nameEn: "Day 1" }] },
    },
    include: { days: true },
  });

  const slot = await prisma.programExercise.create({
    data: {
      dayId: program.days[0].id,
      exerciseId: exercise.id,
      setsCount: 3,
      reps: [8, 8, 8],
      displayOrder: 0,
    },
  });

  // A distinct weight per account, so any leak is visible in the numbers.
  // The last session is 3 days back so it falls inside the trailing 7-day
  // volume window, which is inclusive of today (today - 6 days).
  for (const ago of [21, 14, 3]) {
    await prisma.workoutLog.create({
      data: {
        userId: user.id,
        exerciseId: exercise.id,
        date: daysAgo(ago),
        sets: [{ weight, reps: 8 }],
      },
    });
  }

  await prisma.bodyWeight.create({
    data: { userId: user.id, weightKg: weight, date: daysAgo(7) },
  });

  await prisma.exerciseMemory.create({
    data: { exerciseId: exercise.id, notes: `${label} note` },
  });
  await prisma.globalMemory.create({
    data: { userId: user.id, notes: `${label} global note` },
  });

  return { userId: user.id, exerciseId: exercise.id, slotId: slot.id };
}

beforeAll(async () => {
  const a = await makeAccount("Alice", 60);
  const b = await makeAccount("Bob", 100);
  alice = a.userId;
  aliceExercise = a.exerciseId;
  aliceSlot = a.slotId;
  bob = b.userId;
  bobExercise = b.exerciseId;
  bobSlot = b.slotId;
});

afterAll(async () => {
  for (const id of [alice, bob]) {
    await prisma.suggestion.deleteMany({ where: { exercise: { userId: id } } });
    await prisma.workoutLog.deleteMany({ where: { userId: id } });
    await prisma.exerciseMemory.deleteMany({ where: { exercise: { userId: id } } });
    await prisma.globalMemory.deleteMany({ where: { userId: id } });
    await prisma.bodyWeight.deleteMany({ where: { userId: id } });
    await prisma.program.deleteMany({ where: { userId: id } });
    await prisma.exercise.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("get_progress_summary", () => {
  it("reports only the caller's training", async () => {
    const forAlice = await getProgressSummary({ userId: alice, weeks: 8, now: NOW });
    const forBob = await getProgressSummary({ userId: bob, weeks: 8, now: NOW });

    expect(forAlice.exercises).toHaveLength(1);
    expect(forBob.exercises).toHaveLength(1);
    // Same exercise name in both accounts, different numbers underneath.
    expect(forAlice.exercises[0].bestSet?.weightKg).toBe(60);
    expect(forBob.exercises[0].bestSet?.weightKg).toBe(100);
  });

  it("reports only the caller's body weight", async () => {
    const forAlice = await getProgressSummary({ userId: alice, weeks: 8, now: NOW });

    expect(forAlice.bodyWeight.entries).toBe(1);
    expect(forAlice.bodyWeight.latestKg).toBe(60);
  });
});

describe("get_exercise_history", () => {
  it("resolves a shared name to the caller's own exercise", async () => {
    // The realistic leak: both libraries hold "Bench Press", seeded from the
    // same template. Resolving without an owner returns whichever row is first.
    const forAlice = await getExerciseHistory({ userId: alice, name: SHARED_EN });
    const forBob = await getExerciseHistory({ userId: bob, name: SHARED_EN });

    expect(forAlice.sessions.every((s) => s.sets[0].weight === 60)).toBe(true);
    expect(forBob.sessions.every((s) => s.sets[0].weight === 100)).toBe(true);
  });

  it("resolves a shared Persian name to the caller's own exercise", async () => {
    const forBob = await getExerciseHistory({ userId: bob, name: SHARED_FA });

    expect(forBob.sessions.every((s) => s.sets[0].weight === 100)).toBe(true);
  });

  it("cannot reach an exercise that only the other account has", async () => {
    const bobOnly = `Bob Only ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        nameFa: bobOnly,
        nameEn: bobOnly,
        musclesPrimary: ["lats"],
      },
    });

    try {
      await expect(
        getExerciseHistory({ userId: alice, name: bobOnly }),
      ).rejects.toThrow(ExerciseNotFoundError);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });
});

describe("get_volume", () => {
  it("counts only the caller's sets", async () => {
    const forAlice = await getVolume({ userId: alice, now: NOW });
    const forBob = await getVolume({ userId: bob, now: NOW });

    const chestA = forAlice.byGroup.find((g) => g.group === "chest")!.sets;
    const chestB = forBob.byGroup.find((g) => g.group === "chest")!.sets;

    // One logged session each inside the trailing 7 days, one hard set apiece.
    expect(chestA).toBe(1);
    expect(chestB).toBe(1);
  });
});

describe("get_body_weight", () => {
  it("returns only the caller's entries", async () => {
    const forAlice = await getBodyWeight({ userId: alice });
    const forBob = await getBodyWeight({ userId: bob });

    expect(forAlice.entries.map((e) => e.weightKg)).toEqual([60]);
    expect(forBob.entries.map((e) => e.weightKg)).toEqual([100]);
  });
});

describe("get_coach_memory", () => {
  it("returns only the caller's notes", async () => {
    const forAlice = await getCoachMemory({ userId: alice });
    const forBob = await getCoachMemory({ userId: bob });

    expect(forAlice.global).toBe("Alice global note");
    expect(forBob.global).toBe("Bob global note");

    expect(forAlice.exercises.map((e) => e.notes)).toEqual(["Alice note"]);
    expect(forBob.exercises.map((e) => e.notes)).toEqual(["Bob note"]);
  });

  it("resolves a shared exercise name to the caller's own note", async () => {
    const forAlice = await getCoachMemory({ userId: alice, name: SHARED_EN });

    expect(forAlice.exercises[0].notes).toBe("Alice note");
  });
});

describe("list_programs and get_program", () => {
  it("lists only the caller's programs", async () => {
    const forAlice = await listPrograms({ userId: alice });
    const forBob = await listPrograms({ userId: bob });

    expect(forAlice.programs.map((p) => p.nameEn)).toEqual(["Alice Program"]);
    expect(forBob.programs.map((p) => p.nameEn)).toEqual(["Bob Program"]);
  });

  it("returns the caller's own active program", async () => {
    // Both accounts have an active program - "the active one" is only
    // meaningful per user.
    expect((await getProgram({ userId: alice })).nameEn).toBe("Alice Program");
    expect((await getProgram({ userId: bob })).nameEn).toBe("Bob Program");
  });

  it("refuses another account's program by id", async () => {
    const bobProgram = await prisma.program.findFirst({ where: { userId: bob } });

    await expect(
      getProgram({ userId: alice, id: bobProgram!.id }),
    ).rejects.toThrow(/No program with id/);
  });
});

describe("list_exercises", () => {
  it("lists only the caller's library", async () => {
    const forAlice = await listExercises({ userId: alice });
    const forBob = await listExercises({ userId: bob });

    expect(forAlice.returned).toBe(1);
    expect(forBob.returned).toBe(1);
    // Same name, and that is fine - they are different rows with one owner each.
    expect(forAlice.exercises[0].nameEn).toBe(SHARED_EN);
    expect(forBob.exercises[0].nameEn).toBe(SHARED_EN);
  });

  it("does not surface another account's exercise through search", async () => {
    const bobOnly = `Bob Secret ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        nameFa: bobOnly,
        nameEn: bobOnly,
        musclesPrimary: ["lats"],
      },
    });

    try {
      const forAlice = await listExercises({ userId: alice, search: "Secret" });
      expect(forAlice.returned).toBe(0);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });
});

describe("save_suggestions", () => {
  afterEach(async () => {
    await prisma.suggestion.deleteMany({
      where: { exerciseId: { in: [aliceExercise, bobExercise] } },
    });
  });

  it("writes into the caller's own program slot", async () => {
    await saveSuggestions({
      userId: alice,
      date: TOMORROW,
      items: [
        {
          exercise: SHARED_EN,
          sets: [{ weightKg: 62.5, reps: 8 }],
          why: "progressing",
        },
      ],
      now: NOW,
    });

    const written = await prisma.suggestion.findMany();
    expect(written).toHaveLength(1);
    // The name is identical in both libraries; the row must be Alice's.
    expect(written[0].exerciseId).toBe(aliceExercise);
    expect(written[0].programExerciseId).toBe(aliceSlot);
  });

  it("cannot write into the other account's program even with the same name", async () => {
    await saveSuggestions({
      userId: bob,
      date: TOMORROW,
      items: [
        {
          exercise: SHARED_EN,
          sets: [{ weightKg: 105, reps: 8 }],
          why: "progressing",
        },
      ],
      now: NOW,
    });

    const written = await prisma.suggestion.findMany();
    expect(written).toHaveLength(1);
    expect(written[0].exerciseId).toBe(bobExercise);
    expect(written[0].programExerciseId).toBe(bobSlot);
    expect(written[0].programExerciseId).not.toBe(aliceSlot);
  });

  it("refuses an exercise that only the other account has", async () => {
    const bobOnly = `Bob Private ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        nameFa: bobOnly,
        nameEn: bobOnly,
        musclesPrimary: ["lats"],
      },
    });

    try {
      await expect(
        saveSuggestions({
          userId: alice,
          date: TOMORROW,
          items: [
            { exercise: bobOnly, sets: [{ weightKg: 60, reps: 8 }], why: "x" },
          ],
          now: NOW,
        }),
      ).rejects.toThrow(ExerciseNotFoundError);

      expect(await prisma.suggestion.count()).toBe(0);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });

  it("judges 'already logged' against the caller's own history", async () => {
    // Bob trained today; Alice did not. A guard that ignored the owner would
    // refuse Alice's suggestion because of Bob's session.
    const today = new Date(NOW.toISOString().slice(0, 10));
    const bobLog = await prisma.workoutLog.create({
      data: {
        userId: bob,
        exerciseId: bobExercise,
        date: today,
        sets: [{ weight: 100, reps: 8 }],
      },
    });

    try {
      const result = await saveSuggestions({
        userId: alice,
        date: NOW.toISOString().slice(0, 10),
        items: [
          { exercise: SHARED_EN, sets: [{ weightKg: 62.5, reps: 8 }], why: "x" },
        ],
        now: NOW,
      });

      expect(result.saved).toHaveLength(1);

      // And Bob is still correctly refused for his own logged day.
      await expect(
        saveSuggestions({
          userId: bob,
          date: NOW.toISOString().slice(0, 10),
          items: [
            { exercise: SHARED_EN, sets: [{ weightKg: 105, reps: 8 }], why: "x" },
          ],
          now: NOW,
        }),
      ).rejects.toThrow(/already logged/);
    } finally {
      await prisma.workoutLog.delete({ where: { id: bobLog.id } });
    }
  });

  it("appends notes to the caller's own memory only", async () => {
    await saveSuggestions({
      userId: alice,
      date: TOMORROW,
      items: [
        { exercise: SHARED_EN, sets: [{ weightKg: 62.5, reps: 8 }], why: "x" },
      ],
      exerciseNotes: [{ exercise: SHARED_EN, note: "Alice learned something" }],
      globalNote: "Alice global learning",
      now: NOW,
    });

    const aliceMemory = await prisma.exerciseMemory.findUnique({
      where: { exerciseId: aliceExercise },
    });
    const bobMemory = await prisma.exerciseMemory.findUnique({
      where: { exerciseId: bobExercise },
    });

    expect(aliceMemory!.notes).toContain("Alice learned something");
    expect(bobMemory!.notes).toBe("Bob note");

    const bobGlobal = await prisma.globalMemory.findUnique({
      where: { userId: bob },
    });
    expect(bobGlobal!.notes).toBe("Bob global note");
  });
});
