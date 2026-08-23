/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { GET, POST } from "./route";
import { installProgram } from "@/lib/db/programs";
import { saveProgramDraft } from "@/lib/mcp/tools/save-program-draft";
import { parseWorkoutYaml } from "@/lib/yaml-parser";

const prisma = new PrismaClient();

const TAG = Date.now();

const yamlFor = (name: string, slugs: string[]) => `
program:
  name: "${name}"
  days:
    - name: "Day 1"
      exercises:
${slugs.map((s) => `        - exercise: ${s}\n          sets: 3\n          reps: 10`).join("\n")}
`;

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Test User", weightKg: 80, heightCm: 180 },
  });
  if ((await prisma.exerciseCatalog.count()) === 0) {
    throw new Error("Catalog is empty - run `npm run db:seed-catalog` first.");
  }
});

afterEach(async () => {
  const programs = await prisma.program.findMany({
    where: { userId: 1 },
    select: { id: true },
  });
  const ids = programs.map((p) => p.id);
  const days = await prisma.programDay.findMany({
    where: { programId: { in: ids } },
    select: { id: true },
  });
  await prisma.programExercise.deleteMany({
    where: { dayId: { in: days.map((d) => d.id) } },
  });
  await prisma.programDay.deleteMany({ where: { programId: { in: ids } } });
  await prisma.program.deleteMany({ where: { id: { in: ids } } });
  await prisma.exercise.deleteMany({ where: { userId: 1 } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function installActive(name: string, slugs: string[]) {
  const yaml = yamlFor(name, slugs);
  return installProgram(1, parseWorkoutYaml(yaml), yaml);
}

function propose(name: string, slugs: string[], rationale = "Because.") {
  return saveProgramDraft({ userId: 1, yaml: yamlFor(name, slugs), rationale });
}

const read = async () => (await GET()).json();

function decide(programId: number, action: "approve" | "discard") {
  return POST(
    new NextRequest("http://localhost/api/programs/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, action }),
    }),
  );
}

describe("GET /api/programs/draft", () => {
  it("returns null when nothing is waiting", async () => {
    expect((await read()).draft).toBeNull();
  });

  it("returns the proposal with its reasoning and a diff", async () => {
    await installActive(`Current ${TAG}`, ["barbell_squat"]);
    await propose(`Proposed ${TAG}`, ["barbell_squat", "barbell_deadlift"], "More posterior chain.");

    const { draft } = await read();

    expect(draft.name).toBe(`Proposed ${TAG}`);
    expect(draft.rationale).toBe("More posterior chain.");
    expect(draft.diff.totals.added).toBe(1);
    expect(draft.diff.totals.unchanged).toBe(1);
    expect(draft.diff.identical).toBe(false);
  });

  // The screen shows what would change, so it needs resolved names - an
  // inherited row carries none of its own.
  it("resolves exercise names rather than returning nulls", async () => {
    await propose(`Proposed ${TAG}`, ["barbell_squat"]);

    const { draft } = await read();
    const names = draft.diff.days.flatMap((d: { exercises: { name: string }[] }) =>
      d.exercises.map((e) => e.name),
    );
    expect(names).toContain("Barbell Squat");
    expect(names).not.toContain(null);
  });
});

describe("POST /api/programs/draft", () => {
  it("approving activates it and clears the proposal", async () => {
    const active = await installActive(`Current ${TAG}`, ["barbell_squat"]);
    await propose(`Proposed ${TAG}`, ["barbell_deadlift"]);
    const { draft } = await read();

    const res = await decide(draft.id, "approve");
    expect(res.status).toBe(200);

    const now = await prisma.program.findFirstOrThrow({
      where: { userId: 1, isActive: true },
    });
    expect(now.id).toBe(draft.id);
    expect(now.isDraft).toBe(false);
    expect((await read()).draft).toBeNull();

    // The previous program is retired, not deleted - logs still point at it.
    expect(
      (await prisma.program.findUniqueOrThrow({ where: { id: active.id } })).isActive,
    ).toBe(false);
  });

  it("discarding removes it and leaves the active program alone", async () => {
    const active = await installActive(`Current ${TAG}`, ["barbell_squat"]);
    await propose(`Proposed ${TAG}`, ["barbell_deadlift"]);
    const { draft } = await read();

    expect((await decide(draft.id, "discard")).status).toBe(200);

    expect((await read()).draft).toBeNull();
    const stillActive = await prisma.program.findFirstOrThrow({
      where: { userId: 1, isActive: true },
    });
    expect(stillActive.id).toBe(active.id);
    expect(await prisma.program.count({ where: { id: draft.id } })).toBe(0);
  });

  // The proposal may have been replaced by the coach, or already answered in
  // another tab, since the screen loaded.
  it("refuses a stale proposal id rather than acting on it", async () => {
    await installActive(`Current ${TAG}`, ["barbell_squat"]);
    await propose(`Proposed ${TAG}`, ["barbell_deadlift"]);
    const { draft } = await read();

    await decide(draft.id, "discard");

    const again = await decide(draft.id, "approve");
    expect(again.status).toBe(409);
    expect(await prisma.program.count({ where: { id: draft.id } })).toBe(0);
  });

  it("will not act on a program that is not a draft", async () => {
    const active = await installActive(`Current ${TAG}`, ["barbell_squat"]);

    const res = await decide(active.id, "discard");
    expect(res.status).toBe(409);
    expect(await prisma.program.count({ where: { id: active.id } })).toBe(1);
  });
});
