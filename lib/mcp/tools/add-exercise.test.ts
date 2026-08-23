/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { addExercise, AddExerciseRejected } from "./add-exercise";
import { findByName, findBySlug, resolveLibrary } from "@/lib/db/library";
import { listExercises } from "./read-tools";

const prisma = new PrismaClient();

const TAG = Date.now();
let alice: number;
let bob: number;

beforeAll(async () => {
  const a = await prisma.user.create({
    data: {
      name: "Add Alice",
      username: `add-alice-${TAG}`,
      passwordHash: "x",
      weightKg: 80,
      heightCm: 180,
    },
  });
  const b = await prisma.user.create({
    data: {
      name: "Add Bob",
      username: `add-bob-${TAG}`,
      passwordHash: "x",
      weightKg: 70,
      heightCm: 170,
    },
  });
  alice = a.id;
  bob = b.id;

  if ((await prisma.exerciseCatalog.count()) === 0) {
    throw new Error("Catalog is empty - run `npm run db:seed-catalog` first.");
  }
});

afterEach(async () => {
  await prisma.exercise.deleteMany({ where: { userId: { in: [alice, bob] } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
  await prisma.$disconnect();
});

const valid = (name: string) => ({
  userId: alice,
  name,
  musclesPrimary: ["lats"],
  musclesSecondary: ["biceps_brachii"],
});

describe("add_exercise creates a private exercise", () => {
  it("returns a slug a program can reference immediately", async () => {
    const result = await addExercise(valid(`Reverse Grip Row ${TAG}`));

    expect(result.scope).toBe("personal");
    expect(result.slug).toMatch(/^custom:\d+$/);

    const found = await findBySlug(alice, result.slug);
    expect(found?.name).toBe(`Reverse Grip Row ${TAG}`);
    expect(found?.source).toBe("personal");
  });

  it("shows up in the caller's library and list_exercises", async () => {
    const name = `Reverse Grip Row ${TAG}`;
    await addExercise(valid(name));

    const library = await resolveLibrary(alice);
    expect(library.some((e) => e.name === name)).toBe(true);

    const listed = await listExercises({ userId: alice, search: "Reverse Grip Row" });
    expect(listed.exercises.some((e) => e.name === name)).toBe(true);
  });

  it("trims the name and drops a muscle listed as both roles", async () => {
    const result = await addExercise({
      userId: alice,
      name: `  Padded Name ${TAG}  `,
      musclesPrimary: ["lats"],
      musclesSecondary: ["lats", "biceps_brachii"],
    });

    expect(result.name).toBe(`Padded Name ${TAG}`);
    expect(result.musclesSecondary).toEqual(["biceps_brachii"]);
  });
});

describe("add_exercise never touches the shared catalog", () => {
  // The decision this tool exists under: the thing calling it is a language
  // model, and a shared catalog with no review step means one bad session
  // pollutes every account permanently.
  it("leaves the catalog row count unchanged", async () => {
    const before = await prisma.exerciseCatalog.count();
    await addExercise(valid(`Catalog Untouched ${TAG}`));
    expect(await prisma.exerciseCatalog.count()).toBe(before);
  });

  it("creates a row with no catalog slug at all", async () => {
    const result = await addExercise(valid(`No Slug ${TAG}`));
    const id = Number(result.slug.split(":")[1]);

    const row = await prisma.exercise.findUniqueOrThrow({ where: { id } });
    expect(row.catalogSlug).toBeNull();
    expect(row.userId).toBe(alice);
  });
});

describe("add_exercise validates its input", () => {
  it("rejects an invented muscle and says where the real list is", async () => {
    await expect(
      addExercise({
        userId: alice,
        name: `Bad Muscle ${TAG}`,
        musclesPrimary: ["biceps_peak"],
      }),
    ).rejects.toThrow(/Unknown primary muscle[\s\S]*get_program_schema/);
  });

  // An exercise with no primary mover counts toward no volume, so it would be
  // dead weight in the library.
  it("rejects an exercise with no primary muscle", async () => {
    await expect(
      addExercise({ userId: alice, name: `No Muscle ${TAG}`, musclesPrimary: [] }),
    ).rejects.toThrow(AddExerciseRejected);
  });

  it("rejects an empty name", async () => {
    await expect(
      addExercise({ userId: alice, name: "   ", musclesPrimary: ["lats"] }),
    ).rejects.toThrow(/needs a name/);
  });

  it("rejects an over-long name", async () => {
    await expect(
      addExercise({ userId: alice, name: "x".repeat(81), musclesPrimary: ["lats"] }),
    ).rejects.toThrow(/too long/);
  });

  // A second exercise of the same name makes every later lookup ambiguous, and
  // the caller almost certainly means the one that exists.
  it("refuses a duplicate of the caller's own exercise, naming the slug", async () => {
    const name = `Duplicate Me ${TAG}`;
    const first = await addExercise(valid(name));

    await expect(addExercise(valid(name))).rejects.toThrow(
      new RegExp(`already in your library as .${first.slug}.`),
    );
  });

  it("refuses a duplicate of a catalog exercise", async () => {
    await expect(
      addExercise({
        userId: alice,
        name: "Barbell Squat",
        musclesPrimary: ["quadriceps"],
      }),
    ).rejects.toThrow(/already in your library/);
  });

  it("creates nothing when it rejects", async () => {
    const before = await prisma.exercise.count({ where: { userId: alice } });
    await expect(
      addExercise({
        userId: alice,
        name: `Bad ${TAG}`,
        musclesPrimary: ["not_a_muscle"],
      }),
    ).rejects.toThrow();
    expect(await prisma.exercise.count({ where: { userId: alice } })).toBe(before);
  });
});

describe("add_exercise is scoped to the calling account", () => {
  it("cannot be seen by another account", async () => {
    const name = `Alice Private ${TAG}`;
    await addExercise(valid(name));

    expect(await findByName(bob, name)).toBeNull();
    const forBob = await resolveLibrary(bob);
    expect(forBob.some((e) => e.name === name)).toBe(false);
  });

  // The same name in two accounts is normal - each owns their own row.
  it("lets two accounts each add the same name", async () => {
    const name = `Shared Idea ${TAG}`;
    const forAlice = await addExercise({ ...valid(name), userId: alice });
    const forBob = await addExercise({ ...valid(name), userId: bob });

    expect(forAlice.slug).not.toBe(forBob.slug);
    expect((await findByName(alice, name))?.slug).toBe(forAlice.slug);
    expect((await findByName(bob, name))?.slug).toBe(forBob.slug);
  });
});
