/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { upsertLog } from "./logs";
import { getSession, latestSession, listSessions } from "./sessions";
import { SESSION_GAP_MS } from "@/lib/sessions";
import { localDay } from "@/lib/time";

const prisma = new PrismaClient();

const TAG = Date.now();
let userId: number;
let exerciseA: number;
let exerciseB: number;
let slotA: number;
let slotB: number;
let programId: number;

const BASE = new Date("2026-08-21T06:00:00Z");
const after = (ms: number) => new Date(BASE.getTime() + ms);
const HOUR = 3600_000;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: "Session Tester",
      username: `session-${TAG}`,
      passwordHash: "x",
      weightKg: 80,
      heightCm: 180,
      timeZone: "Asia/Tehran",
    },
  });
  userId = user.id;

  const a = await prisma.exercise.create({
    data: {
      userId,
      name: `Session Exercise A ${TAG}`,
      musclesPrimary: ["pec_major_sternal"],
    },
  });
  const b = await prisma.exercise.create({
    data: {
      userId,
      name: `Session Exercise B ${TAG}`,
      musclesPrimary: ["triceps_brachii"],
    },
  });
  exerciseA = a.id;
  exerciseB = b.id;

  const program = await prisma.program.create({
    data: {
      userId,
      name: `Session Program ${TAG}`,
      yamlContent: "",
      days: { create: [{ dayNumber: 1, name: "Day 1" }] },
    },
    include: { days: true },
  });
  programId = program.id;
  slotA = (
    await prisma.programExercise.create({
      data: {
        dayId: program.days[0].id,
        exerciseId: exerciseA,
        setsCount: 3,
        reps: [8],
        displayOrder: 0,
      },
    })
  ).id;
  slotB = (
    await prisma.programExercise.create({
      data: {
        dayId: program.days[0].id,
        exerciseId: exerciseB,
        setsCount: 3,
        reps: [10],
        displayOrder: 1,
      },
    })
  ).id;
});

afterEach(async () => {
  await prisma.workoutLog.deleteMany({ where: { userId } });
  await prisma.workoutSession.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.program.deleteMany({ where: { id: programId } });
  await prisma.exercise.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

function log(
  exerciseId: number,
  programExerciseId: number,
  date: string,
  at: Date,
  reps = 8,
) {
  return upsertLog(userId, {
    exerciseId,
    programExerciseId,
    date: new Date(date),
    sets: [{ weight: 60, reps }],
    plannedReps: [8, 8, 8],
    at,
  });
}

describe("sessions group the exercises of one workout", () => {
  it("puts exercises logged minutes apart in the same session", async () => {
    await log(exerciseA, slotA, "2026-08-21", BASE);
    await log(exerciseB, slotB, "2026-08-21", after(20 * 60_000));

    const sessions = await listSessions(userId, { limit: 10 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].logs).toHaveLength(2);
    expect(sessions[0].startedAt).toEqual(BASE);
    expect(sessions[0].endedAt).toEqual(after(20 * 60_000));
  });

  // The case the gap rule exists for.
  it("splits a morning and an evening workout", async () => {
    await log(exerciseA, slotA, "2026-08-21", BASE);
    await log(exerciseB, slotB, "2026-08-21", after(11 * HOUR));

    const sessions = await listSessions(userId, { limit: 10 });
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.logs.length)).toEqual([1, 1]);
  });

  // Asserted from both sides, so a change from `<` to `<=` cannot slip through.
  it("treats exactly the gap as new and a hair under as the same session", async () => {
    await log(exerciseA, slotA, "2026-08-21", BASE);
    await log(exerciseB, slotB, "2026-08-21", after(SESSION_GAP_MS));
    expect(await listSessions(userId, { limit: 10 })).toHaveLength(2);

    await prisma.workoutLog.deleteMany({ where: { userId } });
    await prisma.workoutSession.deleteMany({ where: { userId } });

    await log(exerciseA, slotA, "2026-08-21", BASE);
    await log(exerciseB, slotB, "2026-08-21", after(SESSION_GAP_MS - 1000));
    expect(await listSessions(userId, { limit: 10 })).toHaveLength(1);
  });

  it("orders a session's exercises the way they were performed", async () => {
    await log(exerciseB, slotB, "2026-08-21", BASE);
    await log(exerciseA, slotA, "2026-08-21", after(15 * 60_000));

    const session = await latestSession(userId);
    expect(session!.logs.map((l) => l.exerciseId)).toEqual([
      exerciseB,
      exerciseA,
    ]);
  });
});

describe("a later edit does not move a session", () => {
  // Fixing a typo in Monday's bench on Thursday must not stretch Monday's
  // session to three days long. That is why `loggedAt` and `updatedAt` differ.
  it("keeps the boundaries and the first-logged instant when sets are corrected", async () => {
    await log(exerciseA, slotA, "2026-08-21", BASE);
    await log(exerciseB, slotB, "2026-08-21", after(30 * 60_000));

    const before = (await latestSession(userId))!;

    await log(exerciseA, slotA, "2026-08-21", after(72 * HOUR), 5);

    const sessions = await listSessions(userId, { limit: 10 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].startedAt).toEqual(before.startedAt);
    expect(sessions[0].endedAt).toEqual(before.endedAt);

    const edited = sessions[0].logs.find((l) => l.exerciseId === exerciseA)!;
    expect(edited.loggedAt).toEqual(BASE);
    expect(edited.sets).toEqual([{ weight: 60, reps: 5 }]);
    expect(edited.updatedAt.getTime()).toBeGreaterThan(
      edited.loggedAt.getTime(),
    );
  });
});

describe("a session's local day", () => {
  // 22:00 UTC is already tomorrow in Tehran. Bucketing in UTC would file this
  // workout on the wrong day.
  it("comes from the user's timezone, not from UTC", async () => {
    await log(exerciseA, slotA, "2026-08-22", new Date("2026-08-21T22:00:00Z"));

    const session = (await latestSession(userId))!;
    expect(localDay(session.startedAt, "UTC")).toBe("2026-08-21");
    expect(localDay(session.startedAt, "Asia/Tehran")).toBe("2026-08-22");
  });

  it("keeps a workout that runs across local midnight in one session", async () => {
    const beforeMidnight = new Date("2026-08-21T20:20:00Z"); // 23:50 Tehran
    const afterMidnight = new Date("2026-08-21T20:50:00Z"); // 00:20 Tehran
    await log(exerciseA, slotA, "2026-08-21", beforeMidnight);
    await log(exerciseB, slotB, "2026-08-22", afterMidnight);

    const sessions = await listSessions(userId, { limit: 10 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].logs).toHaveLength(2);
    // Filed on the day it started, so a workout is never split in two by the
    // clock rolling over mid-workout.
    expect(localDay(sessions[0].startedAt, "Asia/Tehran")).toBe("2026-08-21");
  });
});

describe("session reads are scoped to their owner", () => {
  it("will not return another account's session by id", async () => {
    await log(exerciseA, slotA, "2026-08-21", BASE);
    const mine = (await latestSession(userId))!;

    const other = await prisma.user.create({
      data: {
        name: "Other",
        username: `session-other-${TAG}`,
        passwordHash: "x",
        weightKg: 70,
        heightCm: 170,
      },
    });
    try {
      expect(await getSession(other.id, mine.id)).toBeNull();
      expect(await getSession(userId, mine.id)).not.toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
