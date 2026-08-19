/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// `currentUserId()` reads the session, so stubbing "logged in" now means
// stubbing *who*. Account 1 is the one the fixtures below create.
jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { DELETE } from "./route";
import { POST as postLog, GET as getLogs } from "../../logs/route";

const prisma = new PrismaClient();

const PROGRAM_NAME = `Progress Ownership Test ${Date.now()}`;

async function makeProgram(isActive: boolean, exerciseId: number) {
  const program = await prisma.program.create({
    data: {
      userId: 1,
      nameFa: PROGRAM_NAME,
      nameEn: PROGRAM_NAME,
      yamlContent: "",
      isActive,
      days: { create: [{ dayNumber: 1, nameFa: "Day 1", nameEn: "Day 1" }] },
    },
    include: { days: true },
  });
  const slot = await prisma.programExercise.create({
    data: {
      dayId: program.days[0].id,
      exerciseId,
      setsCount: 3,
      reps: [10, 10, 10],
      displayOrder: 0,
    },
  });
  return { program, slot };
}

async function logSet(programExerciseId: number, date: string, weight: number) {
  const res = await postLog(
    new NextRequest("http://localhost/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programExerciseId,
        date,
        sets: [{ weight, reps: 10 }],
      }),
    })
  );
  expect(res.status).toBe(200);
}

async function historyFor(programExerciseId: number) {
  const res = await getLogs(
    new NextRequest(
      `http://localhost/api/logs?programExerciseId=${programExerciseId}`
    )
  );
  expect(res.status).toBe(200);
  return (await res.json()).logs as Array<{ sets: unknown; date: string }>;
}

async function deleteProgram(programId: number) {
  return DELETE(new NextRequest(`http://localhost/api/programs/${programId}`), {
    params: Promise.resolve({ id: String(programId) }),
  });
}

describe("workout history outlives the program it was logged under", () => {
  let exerciseId: number;

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
    });
    const exercise = await prisma.exercise.create({
      data: {
        userId: 1,
        nameFa: `تست حرکت ${Date.now()}`,
        nameEn: `Progress Ownership Exercise ${Date.now()}`,
        musclesPrimary: ["pec_major_sternal"],
      },
    });
    exerciseId = exercise.id;
  });

  afterEach(async () => {
    await prisma.workoutLog.deleteMany({ where: { exerciseId } });
    const programs = await prisma.program.findMany({
      where: { nameFa: PROGRAM_NAME },
      select: { id: true },
    });
    for (const p of programs) {
      await prisma.program.delete({ where: { id: p.id } });
    }
  });

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    await prisma.$disconnect();
  });

  // The reported data loss: the user deleted an old program and their logged
  // sets went with it. Deleting a program must detach history, never destroy it.
  it("keeps logged sets when the program they were logged under is deleted", async () => {
    const { program, slot } = await makeProgram(false, exerciseId);
    await logSet(slot.id, "2026-08-10", 60);

    const res = await deleteProgram(program.id);
    expect(res.status).toBe(200);

    const logs = await prisma.workoutLog.findMany({ where: { exerciseId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].sets).toEqual([{ weight: 60, reps: 10 }]);
    // Detached from the deleted slot, still attached to the exercise.
    expect(logs[0].programExerciseId).toBeNull();
    expect(logs[0].exerciseId).toBe(exerciseId);
  });

  // Deleting a program that had coach suggestions used to fail outright on the
  // foreign key, because nothing cleaned them up.
  it("deletes a program that has suggestions attached", async () => {
    const { program, slot } = await makeProgram(false, exerciseId);
    await prisma.suggestion.create({
      data: {
        exerciseId,
        programExerciseId: slot.id,
        date: new Date("2026-08-10"),
        sets: [{ weight: 62.5, reps: 10 }],
        rationale: "test",
      },
    });

    const res = await deleteProgram(program.id);
    expect(res.status).toBe(200);
    expect(await prisma.suggestion.count({ where: { exerciseId } })).toBe(0);
  });

  // Every upload mints fresh program slots, so history keyed on the slot looks
  // empty afterwards even though the sets are still there.
  it("shows history from an earlier program against the new program's slot", async () => {
    const first = await makeProgram(false, exerciseId);
    await logSet(first.slot.id, "2026-08-10", 60);

    // Simulate a re-upload: a brand new program with a brand new slot.
    const second = await makeProgram(true, exerciseId);
    const logs = await historyFor(second.slot.id);

    expect(logs).toHaveLength(1);
    expect(logs[0].sets).toEqual([{ weight: 60, reps: 10 }]);
  });

  it("keeps one log per exercise per date, not one per program slot", async () => {
    const first = await makeProgram(false, exerciseId);
    await logSet(first.slot.id, "2026-08-10", 60);

    const second = await makeProgram(true, exerciseId);
    await logSet(second.slot.id, "2026-08-10", 65);

    const logs = await prisma.workoutLog.findMany({ where: { exerciseId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].sets).toEqual([{ weight: 65, reps: 10 }]);
  });
});
