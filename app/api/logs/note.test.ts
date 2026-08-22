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
import { NOTE_MAX_LENGTH } from "@/lib/notes";

const prisma = new PrismaClient();

const PROGRAM_NAME = `Note Test ${Date.now()}`;

/**
 * The coach could write notes about the user; the user could write nothing
 * back. This is the field that closes that loop, and the whole point of it is
 * that a chatbot reads it later - so what matters is that it round-trips
 * intact, and that clearing it actually clears it.
 */
describe("a note travels with the logged exercise", () => {
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
        name: `Note Exercise ${Date.now()}`,
        musclesPrimary: ["lats"],
      },
    });
    exerciseId = exercise.id;

    const program = await prisma.program.create({
      data: {
        userId: 1,
        name: PROGRAM_NAME,
        yamlContent: "",
        isActive: true,
        days: { create: [{ dayNumber: 1, name: "Day 1" }] },
      },
      include: { days: true },
    });
    programId = program.id;
    slotId = (
      await prisma.programExercise.create({
        data: {
          dayId: program.days[0].id,
          exerciseId,
          setsCount: 3,
          reps: [8, 8, 8],
          displayOrder: 0,
        },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.workoutLog.deleteMany({ where: { exerciseId } });
    await prisma.workoutSession.deleteMany({ where: { userId: 1 } });
  });

  afterAll(async () => {
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    await prisma.$disconnect();
  });

  function save(body: Record<string, unknown>) {
    return postLog(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programExerciseId: slotId,
          date: "2026-08-10",
          sets: [{ weight: 60, reps: 8 }],
          ...body,
        }),
      }),
    );
  }

  async function reload() {
    const res = await getLogs(
      new NextRequest(`http://localhost/api/logs?programExerciseId=${slotId}`),
    );
    const { logs } = (await res.json()) as { logs: Array<{ note: string }> };
    return logs[0].note;
  }

  it("saves and reloads the note unchanged", async () => {
    const written = "Grip gave out before my back did. Straps next time.";
    expect((await save({ note: written })).status).toBe(200);
    expect(await reload()).toBe(written);
  });

  it("keeps line breaks, because people write lists", async () => {
    const written = "set 1 easy\nset 2 ok\nset 3 grindy";
    await save({ note: written });
    expect(await reload()).toBe(written);
  });

  // An absent note and a cleared one are the same thing. One representation
  // cannot be mishandled the way two can.
  it("stores an omitted note as empty, never null", async () => {
    await save({});
    expect(await reload()).toBe("");
  });

  it("lets an existing note be edited without creating a second log", async () => {
    await save({ note: "first thought" });
    await save({ note: "actually, shoulder felt fine" });

    const logs = await prisma.workoutLog.findMany({ where: { exerciseId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe("actually, shoulder felt fine");
  });

  it("lets a note be cleared back to empty", async () => {
    await save({ note: "something" });
    await save({ note: "" });
    expect(await reload()).toBe("");
  });

  // Trailing whitespace from a phone keyboard must not make an empty note look
  // like content to whatever reads it later.
  it("trims surrounding whitespace", async () => {
    await save({ note: "   \n  " });
    expect(await reload()).toBe("");

    await save({ note: "  felt strong  " });
    expect(await reload()).toBe("felt strong");
  });

  // The client's counter is a courtesy; this is the rule.
  it("refuses a note past the limit", async () => {
    const res = await save({ note: "x".repeat(NOTE_MAX_LENGTH + 1) });
    expect(res.status).toBe(400);
  });

  it("accepts a note exactly at the limit", async () => {
    const res = await save({ note: "x".repeat(NOTE_MAX_LENGTH) });
    expect(res.status).toBe(200);
  });

  it("keeps Persian text intact", async () => {
    const written = "ست آخر خیلی سنگین بود";
    await save({ note: written });
    expect(await reload()).toBe(written);
  });
});
