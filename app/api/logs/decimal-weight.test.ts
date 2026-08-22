/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { POST as postLog, GET as getLogs } from "./route";

const prisma = new PrismaClient();

const PROGRAM_NAME = `Decimal Weight Test ${Date.now()}`;

/**
 * The weight input rejected halves (#69): it is a plain number input, and HTML
 * defaults `step` to 1. Plate maths is in 2.5kg jumps, so the field was
 * unusable for a large share of real entries.
 *
 * The fix is on the input, but it is only worth anything if a decimal survives
 * the whole round trip - the JSON body, the `sets` column, and the read back.
 * That is what these assert.
 */
describe("decimal weights survive save and reload", () => {
  let exerciseId: number;
  let slotId: number;
  let programId: number;

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
    });
    const exercise = await prisma.exercise.create({
      data: {
        userId: 1,
        nameFa: `تست وزن اعشاری ${Date.now()}`,
        nameEn: `Decimal Weight Exercise ${Date.now()}`,
        musclesPrimary: ["pec_major_sternal"],
      },
    });
    exerciseId = exercise.id;

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
  });

  afterAll(async () => {
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    await prisma.$disconnect();
  });

  async function save(sets: Array<{ weight: number | null; reps: number | null }>) {
    const res = await postLog(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programExerciseId: slotId, date: "2026-08-10", sets }),
      }),
    );
    expect(res.status).toBe(200);
  }

  async function reload() {
    const res = await getLogs(
      new NextRequest(`http://localhost/api/logs?programExerciseId=${slotId}`),
    );
    expect(res.status).toBe(200);
    const { logs } = (await res.json()) as {
      logs: Array<{ sets: Array<{ weight: number | null; reps: number | null }> }>;
    };
    return logs[0].sets;
  }

  it("keeps a 2.5kg entry exactly, through save and reload", async () => {
    await save([{ weight: 2.5, reps: 8 }]);
    expect(await reload()).toEqual([{ weight: 2.5, reps: 8 }]);
  });

  it("keeps a 62.5kg entry exactly, through save and reload", async () => {
    await save([{ weight: 62.5, reps: 8 }]);
    expect(await reload()).toEqual([{ weight: 62.5, reps: 8 }]);
  });

  // Micro-plates exist, so quarters must not be rounded away either.
  it("keeps a quarter-kilo entry exactly", async () => {
    await save([{ weight: 61.25, reps: 8 }]);
    expect(await reload()).toEqual([{ weight: 61.25, reps: 8 }]);
  });

  // Reps are counted, not measured. A fractional rep is a typo, not a value.
  it("rejects a fractional rep count", async () => {
    const res = await postLog(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programExerciseId: slotId,
          date: "2026-08-10",
          sets: [{ weight: 60, reps: 8.5 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
