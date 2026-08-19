/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Round-trips a create + read for Suggestion, ExerciseMemory, and GlobalMemory
// against a real database. Requires DATABASE_URL/DIRECT_URL to point at a
// reachable Postgres instance (see .github/workflows/ci.yml for the CI
// service container, or run a local Postgres for `npm test` locally).

describe("Suggestion & coach-memory models", () => {
  let userId: number;
  let userCreatedByTest = false;
  let exerciseId: number;
  let programId: number;
  let dayId: number;
  let programExerciseId: number;
  let globalMemoryCreatedByTest = false;

  beforeAll(async () => {
    // `User` is a singleton (id fixed to 1) - reuse it if it already exists
    // (e.g. a real dev DB) instead of clobbering it.
    const existingUser = await prisma.user.findUnique({ where: { id: 1 } });
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const user = await prisma.user.create({
        data: { name: "Test User", weightKg: 80, heightCm: 180 },
      });
      userId = user.id;
      userCreatedByTest = true;
    }

    const exercise = await prisma.exercise.create({
      data: { userId, nameFa: `Test Exercise FA ${Date.now()}`, nameEn: "Test Exercise", musclesPrimary: ["pec_major_sternal"] },
    });
    exerciseId = exercise.id;

    const program = await prisma.program.create({
      data: { userId, nameFa: "Test Program FA", nameEn: "Test Program", yamlContent: "" },
    });
    programId = program.id;

    const day = await prisma.programDay.create({
      data: { programId: program.id, dayNumber: 1, nameFa: "Day 1 FA", nameEn: "Day 1" },
    });
    dayId = day.id;

    const programExercise = await prisma.programExercise.create({
      data: {
        dayId: day.id,
        exerciseId,
        setsCount: 3,
        reps: [10, 10, 10],
        displayOrder: 0,
      },
    });
    programExerciseId = programExercise.id;
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { exerciseId } });
    await prisma.exerciseMemory.deleteMany({ where: { exerciseId } });
    if (globalMemoryCreatedByTest) {
      await prisma.globalMemory.deleteMany({ where: { id: 1 } });
    }
    await prisma.programExercise.deleteMany({ where: { id: programExerciseId } });
    await prisma.programDay.deleteMany({ where: { id: dayId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    if (userCreatedByTest) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("round-trips a Suggestion create/read and enforces the (exerciseId, date) unique constraint", async () => {
    const date = new Date("2026-01-15");

    const created = await prisma.suggestion.create({
      data: {
        exerciseId,
        programExerciseId,
        date,
        sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }],
        rationale: "Progressive overload: +2.5kg from last session.",
      },
    });

    const found = await prisma.suggestion.findUnique({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found?.exerciseId).toBe(exerciseId);
    expect(found?.programExerciseId).toBe(programExerciseId);
    expect(found?.rationale).toBe("Progressive overload: +2.5kg from last session.");
    expect(found?.sets).toEqual([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 8 },
    ]);

    await expect(
      prisma.suggestion.create({
        data: {
          exerciseId,
          programExerciseId,
          date,
          sets: [{ weight: 62.5, reps: 10 }],
          rationale: "Duplicate for the same exercise/date should be rejected.",
        },
      })
    ).rejects.toThrow();
  });

  it("round-trips an ExerciseMemory create/read", async () => {
    const created = await prisma.exerciseMemory.create({
      data: {
        exerciseId,
        notes: "Client plateaued at 60kg for three sessions; consider a deload.",
      },
    });

    const found = await prisma.exerciseMemory.findUnique({
      where: { exerciseId },
    });

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.notes).toBe("Client plateaued at 60kg for three sessions; consider a deload.");
  });

  it("round-trips one GlobalMemory row per user", async () => {
    // `GlobalMemory` stopped being an `id = 1` singleton in #59 - it is now one
    // row per user, keyed on `userId`. Asserting `id === 1` here passed only
    // while the row happened to be the first ever inserted, and failed against
    // any database with history. `userId` is the key that actually means
    // something.
    const existing = await prisma.globalMemory.findUnique({ where: { userId: 1 } });
    if (existing) {
      // Already present (e.g. a real dev DB) - just verify a read round-trips.
      expect(existing.userId).toBe(1);
      expect(existing.notes).toEqual(expect.any(String));
      return;
    }

    const created = await prisma.globalMemory.create({
      data: { userId: 1, notes: "Adherence has been strong for the last 4 weeks." },
    });
    globalMemoryCreatedByTest = true;

    const found = await prisma.globalMemory.findUnique({ where: { userId: 1 } });

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.notes).toBe("Adherence has been strong for the last 4 weeks.");
  });
});
