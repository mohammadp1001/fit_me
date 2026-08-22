/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { POST as postLog } from "./route";
import { expandPlannedReps } from "@/lib/db/logs";

const prisma = new PrismaClient();

const PROGRAM_NAME = `Planned Reps Test ${Date.now()}`;

describe("expandPlannedReps", () => {
  it("keeps a full per-set target as-is", () => {
    expect(expandPlannedReps(3, [8, 8, 6])).toEqual([8, 8, 6]);
  });

  // A slot may carry fewer reps than sets. The log screen has always read the
  // shortfall as "repeat the last value"; expanding applies it once, at write.
  it("repeats the last value to fill the set count", () => {
    expect(expandPlannedReps(4, [10])).toEqual([10, 10, 10, 10]);
    expect(expandPlannedReps(3, [12, 10])).toEqual([12, 10, 10]);
  });

  it("truncates a target longer than the set count", () => {
    expect(expandPlannedReps(2, [8, 8, 8, 8])).toEqual([8, 8]);
  });

  // Zero is a target; "unknown" is not. A slot with no reps must not expand
  // into a run of zeroes that reads as "you were asked for nothing".
  it("expands to nothing when there is no target at all", () => {
    expect(expandPlannedReps(3, [])).toEqual([]);
    expect(expandPlannedReps(0, [8])).toEqual([]);
  });
});

describe("planned reps are snapshotted onto the log", () => {
  let exerciseId: number;
  let programId: number;
  let slotId: number;

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
    });
    const exercise = await prisma.exercise.create({
      data: {
        userId: 1,
        nameFa: `تست ریپ برنامه ${Date.now()}`,
        nameEn: `Planned Reps Exercise ${Date.now()}`,
        musclesPrimary: ["pec_major_sternal"],
      },
    });
    exerciseId = exercise.id;
  });

  beforeEach(async () => {
    const program = await prisma.program.create({
      data: {
        userId: 1,
        nameFa: PROGRAM_NAME,
        nameEn: PROGRAM_NAME,
        yamlContent: "",
        isActive: true,
        days: { create: [{ dayNumber: 1, nameFa: "Day 1", nameEn: "Day 1" }] },
      },
      include: { days: true },
    });
    programId = program.id;
    const slot = await prisma.programExercise.create({
      data: {
        dayId: program.days[0].id,
        exerciseId,
        setsCount: 3,
        reps: [8, 8, 8],
        displayOrder: 0,
      },
    });
    slotId = slot.id;
  });

  afterEach(async () => {
    await prisma.workoutLog.deleteMany({ where: { exerciseId } });
    await prisma.program.deleteMany({ where: { id: programId } });
  });

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    await prisma.$disconnect();
  });

  async function save(
    slot: number,
    sets: Array<{ weight: number | null; reps: number | null }>,
    body: Record<string, unknown> = {},
  ) {
    return postLog(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programExerciseId: slot,
          date: "2026-08-10",
          sets,
          ...body,
        }),
      }),
    );
  }

  const one = () => prisma.workoutLog.findFirstOrThrow({ where: { exerciseId } });

  it("records what the program asked for at save time", async () => {
    expect((await save(slotId, [{ weight: 60, reps: 8 }])).status).toBe(200);
    expect((await one()).plannedReps).toEqual([8, 8, 8]);
  });

  // The whole reason the column exists: the slot is remade by every upload and
  // detached when a program is deleted, so the target had nowhere durable to
  // live.
  it("survives deletion of the program it was logged under", async () => {
    await save(slotId, [{ weight: 60, reps: 6 }]);
    await prisma.program.delete({ where: { id: programId } });

    const log = await one();
    expect(log.programExerciseId).toBeNull();
    expect(log.plannedReps).toEqual([8, 8, 8]);
    expect(log.sets).toEqual([{ weight: 60, reps: 6 }]);
  });

  // A later edit must measure the session against what was asked at the time,
  // not against whatever program is active by then.
  it("is not rewritten when the same session is edited later", async () => {
    await save(slotId, [{ weight: 60, reps: 8 }]);
    await prisma.programExercise.update({
      where: { id: slotId },
      data: { reps: [5, 5, 5], setsCount: 3 },
    });

    await save(slotId, [{ weight: 65, reps: 5 }]);

    const log = await one();
    expect(log.sets).toEqual([{ weight: 65, reps: 5 }]);
    expect(log.plannedReps).toEqual([8, 8, 8]);
  });

  // The target is a fact about the program. A client that could name its own
  // target could log a session that met a goal nobody set.
  it("ignores a target supplied by the client", async () => {
    await save(slotId, [{ weight: 60, reps: 1 }], { plannedReps: [1, 1, 1] });
    expect((await one()).plannedReps).toEqual([8, 8, 8]);
  });
});
