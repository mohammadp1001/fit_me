/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { upsertLog } from "@/lib/db/logs";
import { getSessionDetail, listSessionsSummary } from "./session-tools";

const prisma = new PrismaClient();

const TAG = Date.now();
let userId: number;
let benchId: number;
let rowId: number;
let benchSlot: number;
let rowSlot: number;
let programId: number;

const MORNING = new Date("2026-08-21T06:00:00Z"); // 09:30 Tehran
const after = (ms: number) => new Date(MORNING.getTime() + ms);
const HOUR = 3600_000;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: "MCP Session Tester",
      username: `mcp-session-${TAG}`,
      passwordHash: "x",
      weightKg: 80,
      heightCm: 180,
      timeZone: "Asia/Tehran",
    },
  });
  userId = user.id;

  // Bench is chest-primary, triceps-secondary; row is back. Two different
  // groups, so the muscle summary has something to distinguish.
  const bench = await prisma.exercise.create({
    data: {
      userId,
      name: `Bench Press ${TAG}`,
      musclesPrimary: ["pec_major_sternal"],
      musclesSecondary: ["triceps_brachii"],
    },
  });
  const row = await prisma.exercise.create({
    data: {
      userId,
      name: `Barbell Row ${TAG}`,
      musclesPrimary: ["lats"],
    },
  });
  benchId = bench.id;
  rowId = row.id;

  const program = await prisma.program.create({
    data: {
      userId,
      name: `Program ${TAG}`,
      yamlContent: "",
      days: { create: [{ dayNumber: 1, name: "Push" }] },
    },
    include: { days: true },
  });
  programId = program.id;
  benchSlot = (
    await prisma.programExercise.create({
      data: {
        dayId: program.days[0].id,
        exerciseId: benchId,
        setsCount: 3,
        reps: [8, 8, 8],
        displayOrder: 0,
      },
    })
  ).id;
  rowSlot = (
    await prisma.programExercise.create({
      data: {
        dayId: program.days[0].id,
        exerciseId: rowId,
        setsCount: 3,
        reps: [10, 10, 10],
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

function log({
  exerciseId,
  programExerciseId,
  date,
  at,
  sets,
  plannedReps,
  note = "",
}: {
  exerciseId: number;
  programExerciseId: number;
  date: string;
  at: Date;
  sets: Array<{ weight: number | null; reps: number | null }>;
  plannedReps: number[];
  note?: string;
}) {
  return upsertLog(userId, {
    exerciseId,
    programExerciseId,
    date: new Date(date),
    sets,
    plannedReps,
    note,
    at,
  });
}

async function aFullSession() {
  await log({
    exerciseId: benchId,
    programExerciseId: benchSlot,
    date: "2026-08-21",
    at: MORNING,
    sets: [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
      { weight: 60, reps: 6 },
    ],
    plannedReps: [8, 8, 8],
    note: "Last set was grindy.",
  });
  await log({
    exerciseId: rowId,
    programExerciseId: rowSlot,
    date: "2026-08-21",
    at: after(25 * 60_000),
    sets: [
      { weight: 70, reps: 10 },
      { weight: 70, reps: 10 },
      { weight: 70, reps: 10 },
    ],
    plannedReps: [10, 10, 10],
  });
}

describe("list_sessions is a skimmable index", () => {
  it("summarises a session without returning its sets", async () => {
    await aFullSession();

    const { sessions } = await listSessionsSummary({ userId });
    expect(sessions).toHaveLength(1);

    const s = sessions[0];
    expect(s.date).toBe("2026-08-21");
    expect(s.exerciseCount).toBe(2);
    expect(s.noteCount).toBe(1);
    expect(s.durationMinutes).toBe(25);
    // The index deliberately carries no sets - that is what get_session is for.
    expect(JSON.stringify(s)).not.toContain("weight");
  });

  // Muscle groups, not program names, are the unit that matters when comparing
  // sessions - so the index has to carry them.
  it("labels a session by the muscle groups it trained", async () => {
    await aFullSession();

    const { sessions } = await listSessionsSummary({ userId });
    const groups = sessions[0].muscles.map((m) => m.group);
    expect(groups).toContain("chest");
    expect(groups).toContain("back");
    expect(groups).toContain("arms");
    // Sorted heaviest first, so the headline group reads first.
    const sets = sessions[0].muscles.map((m) => m.sets);
    expect([...sets].sort((a, b) => b - a)).toEqual(sets);
  });

  it("reports times in the user's timezone, not UTC", async () => {
    await aFullSession();

    const { sessions, timeZone } = await listSessionsSummary({ userId });
    expect(timeZone).toBe("Asia/Tehran");
    // 06:00Z is 09:30 in Tehran.
    expect(sessions[0].startedAt).toBe("09:30");
  });

  it("returns sessions newest first and honours the limit", async () => {
    await aFullSession();
    await log({
      exerciseId: benchId,
      programExerciseId: benchSlot,
      date: "2026-08-22",
      at: after(30 * HOUR),
      sets: [{ weight: 62.5, reps: 8 }],
      plannedReps: [8, 8, 8],
    });

    const { sessions } = await listSessionsSummary({ userId });
    expect(sessions.map((s) => s.date)).toEqual(["2026-08-22", "2026-08-21"]);

    const limited = await listSessionsSummary({ userId, limit: 1 });
    expect(limited.sessions).toHaveLength(1);
    expect(limited.sessions[0].date).toBe("2026-08-22");
  });
});

describe("get_session opens one workout", () => {
  it("defaults to the most recent session", async () => {
    await aFullSession();
    await log({
      exerciseId: benchId,
      programExerciseId: benchSlot,
      date: "2026-08-22",
      at: after(30 * HOUR),
      sets: [{ weight: 62.5, reps: 8 }],
      plannedReps: [8, 8, 8],
    });

    const session = await getSessionDetail({ userId });
    expect(session.date).toBe("2026-08-22");
  });

  it("returns exercises in the order they were performed, each with its time", async () => {
    await aFullSession();

    const session = await getSessionDetail({ userId });
    expect(session.exercises.map((e) => e.name)).toEqual([
      `Bench Press ${TAG}`,
      `Barbell Row ${TAG}`,
    ]);
    expect(session.exercises[0].at).toBe("09:30");
    expect(session.exercises[1].at).toBe("09:55");
  });

  // The coach should not have to compare two arrays itself to answer the
  // question the user actually asks.
  it("reports actual against planned, and whether the work was completed", async () => {
    await aFullSession();

    const session = await getSessionDetail({ userId });
    const bench = session.exercises[0];
    expect(bench.sets).toEqual([
      { weight: 60, reps: 8, plannedReps: 8 },
      { weight: 60, reps: 8, plannedReps: 8 },
      { weight: 60, reps: 6, plannedReps: 8 },
    ]);
    expect(bench.completedAllSets).toBe(true);
    expect(bench.completedAllReps).toBe(false);

    const row = session.exercises[1];
    expect(row.completedAllReps).toBe(true);
  });

  it("carries the user's note through", async () => {
    await aFullSession();

    const session = await getSessionDetail({ userId });
    expect(session.exercises[0].note).toBe("Last set was grindy.");
    expect(session.exercises[1].note).toBe("");
  });

  it("finds a session by local date", async () => {
    await aFullSession();
    const session = await getSessionDetail({ userId, date: "2026-08-21" });
    expect(session.exerciseCount).toBe(2);
  });

  // The date the caller means is the local one the index reported. A UTC
  // comparison would disagree for anything logged near local midnight.
  it("matches the date on the user's local day, not UTC", async () => {
    // 22:00Z on the 21st is already 01:30 on the 22nd in Tehran.
    await log({
      exerciseId: benchId,
      programExerciseId: benchSlot,
      date: "2026-08-22",
      at: new Date("2026-08-21T22:00:00Z"),
      sets: [{ weight: 60, reps: 8 }],
      plannedReps: [8, 8, 8],
    });

    const session = await getSessionDetail({ userId, date: "2026-08-22" });
    expect(session.exerciseCount).toBe(1);
    await expect(
      getSessionDetail({ userId, date: "2026-08-21" }),
    ).rejects.toThrow();
  });

  it("explains itself when there is nothing to return", async () => {
    await expect(getSessionDetail({ userId })).rejects.toThrow(
      /No sessions logged yet/,
    );
    await aFullSession();
    await expect(
      getSessionDetail({ userId, date: "2020-01-01" }),
    ).rejects.toThrow(/No session logged on 2020-01-01/);
  });
});

describe("session tools are scoped to the calling account", () => {
  it("will not open another account's session by id", async () => {
    await aFullSession();
    const mine = await getSessionDetail({ userId });

    const other = await prisma.user.create({
      data: {
        name: "Other",
        username: `mcp-session-other-${TAG}`,
        passwordHash: "x",
        weightKg: 70,
        heightCm: 170,
      },
    });
    try {
      await expect(
        getSessionDetail({ userId: other.id, id: mine.id }),
      ).rejects.toThrow();
      expect((await listSessionsSummary({ userId: other.id })).sessions).toEqual(
        [],
      );
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
