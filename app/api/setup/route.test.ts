/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// The route gates on the session cookie; these tests are about what an upload
// does to the library underneath it, so authentication is stubbed as
// always-passing. `currentUserId()` reads the session, so stubbing "logged in"
// means stubbing *who*. Account 1 is the one the fixtures below create.
jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { POST } from "./route";

const prisma = new PrismaClient();

const PROGRAM_NAME = `Setup Route Test Program ${Date.now()}`;

/** A slug that really is in the shipped catalog. */
const SLUG = "barbell_squat";

function yamlFor(slug: string, extra = ""): string {
  return `
program:
  name: "${PROGRAM_NAME}"
  days:
    - name: "Day 1"
      exercises:
        - exercise: ${slug}
          sets: 3
          reps: 10
${extra}
`;
}

async function upload(yamlContent: string) {
  const request = new NextRequest("http://localhost/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      weightKg: 80,
      heightCm: 180,
      yamlContent,
    }),
  });
  return POST(request);
}

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
    where: { name: { startsWith: "Setup Route Test Program" } },
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

describe("/api/setup resolves exercises by slug", () => {
  it("installs a program that references a catalog exercise", async () => {
    expect((await upload(yamlFor(SLUG))).status).toBe(200);

    const slots = await prisma.programExercise.findMany({
      include: { exercise: { include: { catalog: true } } },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].exercise.catalogSlug).toBe(SLUG);
    expect(slots[0].setsCount).toBe(3);
    // A single integer stays a single entry. Readers repeat the last value,
    // and `expandPlannedReps` applies exactly that rule when snapshotting.
    expect(slots[0].reps).toEqual([10]);
  });

  it("materialises exactly one row per referenced exercise", async () => {
    await upload(yamlFor(SLUG));
    await upload(yamlFor(SLUG));

    // Re-uploading binds to the same row rather than minting a second. Under
    // the old name matching this was the bug that took a 29-row library to 55
    // in a single upload (#45); addressing by slug removes the guesswork.
    expect(await prisma.exercise.count({ where: { userId: 1 } })).toBe(1);
  });

  it("carries the coach's note onto the slot", async () => {
    await upload(`
program:
  name: "${PROGRAM_NAME}"
  days:
    - name: "Day 1"
      exercises:
        - exercise: ${SLUG}
          sets: 3
          reps: 10
          note: "Add 2.5kg when all three sets hit 10."
`);

    const slot = await prisma.programExercise.findFirstOrThrow();
    expect(slot.note).toBe("Add 2.5kg when all three sets hit 10.");
  });
});

describe("/api/setup cannot change what an exercise is", () => {
  // The whole reason anatomy left the program format: those keys were silently
  // authoritative, so one sloppy or hallucinated file could re-tag a lift and
  // corrupt the volume chart.
  it("rejects a file that carries muscles", async () => {
    const res = await upload(`
program:
  name: "${PROGRAM_NAME}"
  days:
    - name: "Day 1"
      exercises:
        - exercise: ${SLUG}
          sets: 3
          reps: 10
          muscles:
            primary: [biceps_brachii]
`);
    expect(res.status).toBe(400);

    const catalog = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });
    expect(catalog.musclesPrimary).not.toEqual(["biceps_brachii"]);
  });

  it("leaves the catalog untouched by a successful upload", async () => {
    const before = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });

    await upload(yamlFor(SLUG));

    const after = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });
    expect(after).toEqual(before);
  });

  it("leaves the materialised row inheriting, not overridden", async () => {
    await upload(yamlFor(SLUG));

    const row = await prisma.exercise.findFirstOrThrow({ where: { userId: 1 } });
    // A null name means the row still reads from the catalog, so a later
    // catalog correction reaches this user.
    expect(row.name).toBeNull();
  });
});

describe("/api/setup fails whole on an unknown slug", () => {
  it("rejects the upload and names near-matches", async () => {
    const res = await upload(yamlFor("barbell_squatt"));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.detail ?? body.error).toMatch(/barbell_squat/);
  });

  // Installing a partial program would leave the user with a broken plan and
  // no previous one, since the old program is deactivated as part of the write.
  it("leaves the previous program active", async () => {
    await upload(yamlFor(SLUG));
    const before = await prisma.program.findFirstOrThrow({
      where: { userId: 1, isActive: true },
    });

    const res = await upload(`
program:
  name: "${PROGRAM_NAME} second"
  days:
    - name: "Day 1"
      exercises:
        - exercise: ${SLUG}
          sets: 3
          reps: 10
        - exercise: not_a_real_exercise
          sets: 3
          reps: 10
`);
    expect(res.status).toBe(400);

    const after = await prisma.program.findFirstOrThrow({
      where: { userId: 1, isActive: true },
    });
    expect(after.id).toBe(before.id);
    expect(
      await prisma.program.count({ where: { name: `${PROGRAM_NAME} second` } }),
    ).toBe(0);
  });
});
