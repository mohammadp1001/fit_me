/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { saveSuggestions, SuggestionRejected } from "./save-suggestions";
import { ExerciseNotFoundError } from "@/lib/exercise-lookup";
import { parseNote } from "@/lib/coach-notes";

/**
 * The only write path in the MCP server.
 *
 * The MCP client's approval prompt is the intended gate, but "always allow"
 * removes it silently - so every guard is enforced server-side and every guard
 * gets a test here. A guard without a test is a guard that can be deleted by
 * accident.
 */

const prisma = new PrismaClient();

const TAG = `save-sugg-${Date.now()}`;
const NOW = new Date("2026-08-17T10:00:00.000Z");
const TODAY = "2026-08-17";
const TOMORROW = "2026-08-18";
const YESTERDAY = "2026-08-16";

let benchId: number;
let squatId: number;
let orphanId: number;
let programId: number;

function dayOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
  });

  // This suite owns "which program is active" - it is single-user global state.
  await prisma.program.updateMany({
    where: { userId: 1, isActive: true },
    data: { isActive: false },
  });

  const bench = await prisma.exercise.create({
    data: {
      nameFa: `پرس سینه ${TAG}`,
      nameEn: `Bench ${TAG}`,
      musclesPrimary: ["pec_major_sternal"],
    },
  });
  benchId = bench.id;

  const squat = await prisma.exercise.create({
    data: {
      nameFa: `اسکوات ${TAG}`,
      nameEn: `Squat ${TAG}`,
      musclesPrimary: ["quadriceps"],
    },
  });
  squatId = squat.id;

  // Deliberately not in any program, to exercise the "nowhere to show" guard.
  const orphan = await prisma.exercise.create({
    data: {
      nameFa: `یتیم ${TAG}`,
      nameEn: `Orphan ${TAG}`,
      musclesPrimary: ["lats"],
    },
  });
  orphanId = orphan.id;

  const program = await prisma.program.create({
    data: {
      userId: 1,
      nameFa: `برنامه ${TAG}`,
      nameEn: `Program ${TAG}`,
      yamlContent: "",
      isActive: true,
      days: { create: [{ dayNumber: 1, nameFa: "روز ۱", nameEn: "Day 1" }] },
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
      },
      {
        dayId: program.days[0].id,
        exerciseId: squatId,
        setsCount: 3,
        reps: [5, 5, 5],
        displayOrder: 1,
      },
    ],
  });
});

beforeEach(async () => {
  await prisma.suggestion.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.workoutLog.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.exerciseMemory.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
});

afterAll(async () => {
  await prisma.suggestion.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.workoutLog.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.exerciseMemory.deleteMany({
    where: { exerciseId: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.program.deleteMany({ where: { id: programId } });
  await prisma.exercise.deleteMany({
    where: { id: { in: [benchId, squatId, orphanId] } },
  });
  await prisma.$disconnect();
});

function item(exercise: string, weightKg: number | null = 60) {
  return {
    exercise,
    sets: [
      { weightKg, reps: 8 },
      { weightKg, reps: 8 },
    ],
    why: "Hit 8/8 twice last session.",
  };
}

describe("saving suggestions", () => {
  it("writes sets the log screen can read", async () => {
    const result = await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`, 62.5)],
      now: NOW,
    });

    expect(result.saved).toEqual([
      { nameFa: `پرس سینه ${TAG}`, nameEn: `Bench ${TAG}`, sets: 2 },
    ]);

    const row = await prisma.suggestion.findUnique({
      where: { exerciseId_date: { exerciseId: benchId, date: dayOnly(TOMORROW) } },
    });

    // `{ weight, reps }` is what lib/log-prefill.ts reads. Renaming the key
    // here would silently stop the suggestion appearing at the gym.
    expect(row!.sets).toEqual([
      { weight: 62.5, reps: 8 },
      { weight: 62.5, reps: 8 },
    ]);
    expect(row!.rationale).toBe("Hit 8/8 twice last session.");
  });

  it("attaches the suggestion to the active program's slot", async () => {
    // `Suggestion.programExerciseId` is what the log screen queries by. A row
    // pointing at the wrong slot would exist but never be seen.
    await saveSuggestions({ date: TODAY, items: [item(`Bench ${TAG}`)], now: NOW });

    const row = await prisma.suggestion.findFirst({ where: { exerciseId: benchId } });
    const slot = await prisma.programExercise.findUnique({
      where: { id: row!.programExerciseId },
      include: { day: true },
    });

    expect(slot!.exerciseId).toBe(benchId);
    expect(slot!.day.programId).toBe(programId);
  });

  it("accepts today", async () => {
    const result = await saveSuggestions({
      date: TODAY,
      items: [item(`Bench ${TAG}`)],
      now: NOW,
    });

    expect(result.date).toBe(TODAY);
  });

  it("resolves an exercise by its Persian name", async () => {
    const result = await saveSuggestions({
      date: TOMORROW,
      items: [item(`اسکوات ${TAG}`, 100)],
      now: NOW,
    });

    expect(result.saved[0].nameEn).toBe(`Squat ${TAG}`);
  });

  it("stores null weight for bodyweight work", async () => {
    await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`, null)],
      now: NOW,
    });

    const row = await prisma.suggestion.findFirst({ where: { exerciseId: benchId } });
    expect((row!.sets as Array<{ weight: number | null }>)[0].weight).toBeNull();
  });

  it("replaces an unlogged suggestion for the same day rather than duplicating", async () => {
    await saveSuggestions({ date: TOMORROW, items: [item(`Bench ${TAG}`, 60)], now: NOW });
    await saveSuggestions({ date: TOMORROW, items: [item(`Bench ${TAG}`, 65)], now: NOW });

    const rows = await prisma.suggestion.findMany({ where: { exerciseId: benchId } });
    expect(rows).toHaveLength(1);
    expect((rows[0].sets as Array<{ weight: number }>)[0].weight).toBe(65);
  });

  it("saves several exercises in one call", async () => {
    const result = await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`), item(`Squat ${TAG}`, 100)],
      now: NOW,
    });

    expect(result.saved).toHaveLength(2);
    expect(await prisma.suggestion.count({ where: { date: dayOnly(TOMORROW) } })).toBe(2);
  });
});

describe("guards that survive an always-allow client", () => {
  it("refuses a date in the past", async () => {
    await expect(
      saveSuggestions({ date: YESTERDAY, items: [item(`Bench ${TAG}`)], now: NOW }),
    ).rejects.toThrow(SuggestionRejected);

    expect(await prisma.suggestion.count({ where: { exerciseId: benchId } })).toBe(0);
  });

  it("refuses to overwrite a day that was already logged", async () => {
    // Once sets are logged the suggestion is history. Replacing it would
    // rewrite what the user was told at the time.
    await prisma.workoutLog.create({
      data: {
        userId: 1,
        exerciseId: benchId,
        date: dayOnly(TODAY),
        sets: [{ weight: 60, reps: 8 }],
      },
    });

    await expect(
      saveSuggestions({ date: TODAY, items: [item(`Bench ${TAG}`)], now: NOW }),
    ).rejects.toThrow(/already logged/);

    expect(await prisma.suggestion.count({ where: { exerciseId: benchId } })).toBe(0);
  });

  it("refuses an exercise that is not in the active program", async () => {
    await expect(
      saveSuggestions({ date: TOMORROW, items: [item(`Orphan ${TAG}`)], now: NOW }),
    ).rejects.toThrow(/not in the active program/);
  });

  it("refuses an unknown exercise and creates nothing", async () => {
    const before = await prisma.exercise.count();

    await expect(
      saveSuggestions({ date: TOMORROW, items: [item("No Such Lift")], now: NOW }),
    ).rejects.toThrow(ExerciseNotFoundError);

    expect(await prisma.exercise.count()).toBe(before);
  });

  it("refuses a set with non-positive reps", async () => {
    await expect(
      saveSuggestions({
        date: TOMORROW,
        items: [
          { exercise: `Bench ${TAG}`, sets: [{ weightKg: 60, reps: 0 }], why: "x" },
        ],
        now: NOW,
      }),
    ).rejects.toThrow(/Reps must be a positive integer/);
  });

  it("refuses a negative weight", async () => {
    await expect(
      saveSuggestions({
        date: TOMORROW,
        items: [
          { exercise: `Bench ${TAG}`, sets: [{ weightKg: -5, reps: 8 }], why: "x" },
        ],
        now: NOW,
      }),
    ).rejects.toThrow(/weightKg/);
  });

  it("refuses an item with no rationale", async () => {
    // The rationale is what the user judges the numbers by in the approval
    // prompt. Without it the approval is a rubber stamp.
    await expect(
      saveSuggestions({
        date: TOMORROW,
        items: [
          { exercise: `Bench ${TAG}`, sets: [{ weightKg: 60, reps: 8 }], why: "  " },
        ],
        now: NOW,
      }),
    ).rejects.toThrow(/no rationale/);
  });

  it("refuses an empty items list", async () => {
    await expect(
      saveSuggestions({ date: TOMORROW, items: [], now: NOW }),
    ).rejects.toThrow(SuggestionRejected);
  });

  it("refuses a malformed date", async () => {
    await expect(
      saveSuggestions({ date: "18-08-2026", items: [item(`Bench ${TAG}`)], now: NOW }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("writes nothing at all when one item in a batch is bad", async () => {
    // Everything is resolved and validated before the first write, so a bad
    // item cannot leave half a day's suggestions saved.
    await expect(
      saveSuggestions({
        date: TOMORROW,
        items: [item(`Bench ${TAG}`), item("No Such Lift")],
        now: NOW,
      }),
    ).rejects.toThrow(ExerciseNotFoundError);

    expect(await prisma.suggestion.count({ where: { date: dayOnly(TOMORROW) } })).toBe(0);
  });
});

describe("coach memory writes", () => {
  it("appends an exercise note with a date", async () => {
    await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`)],
      exerciseNotes: [{ exercise: `Bench ${TAG}`, note: "Stalls at week three." }],
      now: NOW,
    });

    const memory = await prisma.exerciseMemory.findUnique({
      where: { exerciseId: benchId },
    });

    expect(memory!.notes).toBe("[2026-08-17] Stalls at week three.");
  });

  it("keeps earlier notes when appending a new one", async () => {
    await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`)],
      exerciseNotes: [{ exercise: `Bench ${TAG}`, note: "First observation." }],
      now: NOW,
    });
    // A week later. The session date has to move with `now`, or the past-date
    // guard correctly refuses it.
    await saveSuggestions({
      date: "2026-08-25",
      items: [item(`Bench ${TAG}`)],
      exerciseNotes: [{ exercise: `Bench ${TAG}`, note: "Second observation." }],
      now: new Date("2026-08-24T10:00:00.000Z"),
    });

    const memory = await prisma.exerciseMemory.findUnique({
      where: { exerciseId: benchId },
    });
    const entries = parseNote(memory!.notes);

    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe("First observation.");
    expect(entries[1].text).toBe("Second observation.");
  });

  it("appends the global note without dropping what was there", async () => {
    const before = await prisma.globalMemory.findUnique({ where: { id: 1 } });
    const countBefore = parseNote(before?.notes).length;

    await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`)],
      globalNote: `Skips Fridays ${TAG}.`,
      now: NOW,
    });

    const after = await prisma.globalMemory.findUnique({ where: { id: 1 } });
    const entries = parseNote(after!.notes);

    expect(entries.length).toBe(countBefore + 1);
    expect(entries[entries.length - 1].text).toBe(`Skips Fridays ${TAG}.`);
  });

  it("reports which notes it touched", async () => {
    const result = await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`)],
      exerciseNotes: [{ exercise: `Bench ${TAG}`, note: "A note." }],
      globalNote: "A global note.",
      now: NOW,
    });

    expect(result.exerciseNotesUpdated).toEqual([`Bench ${TAG}`]);
    expect(result.globalNoteUpdated).toBe(true);
  });

  it("does not touch memory when no notes are supplied", async () => {
    const result = await saveSuggestions({
      date: TOMORROW,
      items: [item(`Bench ${TAG}`)],
      now: NOW,
    });

    expect(result.exerciseNotesUpdated).toEqual([]);
    expect(result.globalNoteUpdated).toBe(false);
    expect(
      await prisma.exerciseMemory.count({ where: { exerciseId: benchId } }),
    ).toBe(0);
  });
});
