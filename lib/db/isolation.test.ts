/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import {
  AmbiguousExerciseError,
  ExerciseNotFoundError,
  findExerciseByName,
  getExercise,
  listExercises,
  resolveExerciseStrict,
  updateExercise,
} from "./exercises";
import {
  getGlobalMemory,
  listExerciseMemory,
  setExerciseMemory,
  setGlobalMemory,
} from "./memory";

/**
 * Two accounts must not be able to see or touch each other's data.
 *
 * This is the point of #59, and it cannot be checked by the existing suites -
 * they all run as user 1, so a missing filter looks identical to a correct one.
 * Here a second account exists specifically so an unscoped query fails.
 *
 * The design decision these enforce: FitMe accounts are fully isolated, with no
 * user list, no profiles and no coach role. That means there is **no**
 * legitimate cross-user read, so any leak is a bug rather than a feature
 * boundary to argue about.
 */

const prisma = new PrismaClient();

const TAG = `iso-${Date.now()}`;
const SHARED_FA = `پرس مشترک ${TAG}`;
const SHARED_EN = `Shared Bench ${TAG}`;

let alice: number;
let bob: number;
let aliceExercise: number;
let bobExercise: number;

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Alice", weightKg: 80, heightCm: 180 },
  });
  alice = 1;

  const second = await prisma.user.create({
    data: { id: 99, name: `Bob ${TAG}`, weightKg: 70, heightCm: 170 },
  });
  bob = second.id;

  // Deliberately the same names for both accounts: this is what the old
  // globally-unique `nameFa` made impossible.
  const a = await prisma.exercise.create({
    data: {
      userId: alice,
      nameFa: SHARED_FA,
      nameEn: SHARED_EN,
      musclesPrimary: ["pec_major_sternal"],
    },
  });
  aliceExercise = a.id;

  const b = await prisma.exercise.create({
    data: {
      userId: bob,
      nameFa: SHARED_FA,
      nameEn: SHARED_EN,
      musclesPrimary: ["lats"],
    },
  });
  bobExercise = b.id;
});

afterAll(async () => {
  await prisma.exerciseMemory.deleteMany({
    where: { exerciseId: { in: [aliceExercise, bobExercise] } },
  });
  await prisma.globalMemory.deleteMany({ where: { userId: bob } });
  await prisma.exercise.deleteMany({
    where: { id: { in: [aliceExercise, bobExercise] } },
  });
  await prisma.user.deleteMany({ where: { id: bob } });
  await prisma.$disconnect();
});

describe("the exercise library is per user", () => {
  it("lets two accounts own the same Persian name", async () => {
    // The whole reason `nameFa @unique` became `@@unique([userId, nameFa])`.
    const both = await prisma.exercise.findMany({ where: { nameFa: SHARED_FA } });

    expect(both).toHaveLength(2);
    expect(new Set(both.map((e) => e.userId))).toEqual(new Set([alice, bob]));
  });

  it("still refuses a duplicate name within one account", async () => {
    await expect(
      prisma.exercise.create({
        data: {
          userId: alice,
          nameFa: SHARED_FA,
          nameEn: "Duplicate",
          musclesPrimary: ["lats"],
        },
      }),
    ).rejects.toThrow();
  });

  it("resolves each account to its own row for the same name", async () => {
    const forAlice = await resolveExerciseStrict(alice, SHARED_FA);
    const forBob = await resolveExerciseStrict(bob, SHARED_FA);

    expect(forAlice.id).toBe(aliceExercise);
    expect(forBob.id).toBe(bobExercise);
    expect(forAlice.id).not.toBe(forBob.id);
  });

  it("resolves the English name per account too", async () => {
    // `nameEn` is not unique, so this is the path that would silently return
    // the lowest id across the whole table if the owner were dropped.
    const forBob = await resolveExerciseStrict(bob, SHARED_EN);

    expect(forBob.id).toBe(bobExercise);
  });

  it("does not see another account's exercise at all", async () => {
    const onlyBobHas = `Bob Only ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        nameFa: onlyBobHas,
        nameEn: onlyBobHas,
        musclesPrimary: ["lats"],
      },
    });

    try {
      await expect(resolveExerciseStrict(alice, onlyBobHas)).rejects.toThrow(
        ExerciseNotFoundError,
      );
      expect(await findExerciseByName(alice, onlyBobHas)).toBeNull();
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });

  it("does not offer another account's exercises as suggestions", async () => {
    // The not-found error carries near-matches. Those must come from the
    // caller's own library, or the message leaks what someone else trains.
    const bobOnly = `Bob Secret Lift ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        nameFa: bobOnly,
        nameEn: bobOnly,
        musclesPrimary: ["lats"],
      },
    });

    let error: ExerciseNotFoundError | undefined;
    try {
      await resolveExerciseStrict(alice, `Secret Lift ${TAG}`);
    } catch (e) {
      error = e as ExerciseNotFoundError;
    }

    try {
      expect(error).toBeInstanceOf(ExerciseNotFoundError);

      // The message echoes the caller's own search term, which is fine. What
      // must not appear is Bob's row - neither its name in the text nor its id
      // in the suggestions.
      expect(error!.message).not.toContain(bobOnly);
      expect(error!.suggestions.every((s) => s.id !== created.id)).toBe(true);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });

  it("only counts ambiguity within one account", async () => {
    // Two rows sharing a nameEn across *different* accounts is normal, not
    // ambiguous - each owner has exactly one.
    await expect(resolveExerciseStrict(alice, SHARED_EN)).resolves.toMatchObject(
      { id: aliceExercise },
    );

    const dup = await prisma.exercise.create({
      data: {
        userId: alice,
        nameFa: `دوگانه ${TAG}`,
        nameEn: SHARED_EN,
        musclesPrimary: ["lats"],
      },
    });

    try {
      // Now Alice really does have two, so it becomes ambiguous for her only.
      await expect(resolveExerciseStrict(alice, SHARED_EN)).rejects.toThrow(
        AmbiguousExerciseError,
      );
      await expect(resolveExerciseStrict(bob, SHARED_EN)).resolves.toMatchObject(
        { id: bobExercise },
      );
    } finally {
      await prisma.exercise.delete({ where: { id: dup.id } });
    }
  });

  it("lists only the caller's library", async () => {
    const forAlice = await listExercises(alice, { limit: 500 });
    const forBob = await listExercises(bob, { limit: 500 });

    expect(forAlice.some((e) => e.nameFa === SHARED_FA)).toBe(true);
    expect(forBob).toHaveLength(1);
    expect(forBob[0].musclesPrimary).toEqual(["lats"]);
  });
});

describe("reading and editing another account's exercise by id", () => {
  it("cannot be read", async () => {
    expect(await getExercise(alice, bobExercise)).toBeNull();
    expect(await getExercise(bob, bobExercise)).not.toBeNull();
  });

  it("cannot be edited", async () => {
    // Ownership is part of the update, not a check the route has to remember.
    const result = await updateExercise(alice, bobExercise, {
      nameEn: "Hijacked",
    });

    expect(result).toBeNull();

    const untouched = await prisma.exercise.findUnique({
      where: { id: bobExercise },
    });
    expect(untouched!.nameEn).toBe(SHARED_EN);
  });
});

describe("coach memory is per user", () => {
  it("gives each account its own global note", async () => {
    await setGlobalMemory(alice, `Alice note ${TAG}`);
    await setGlobalMemory(bob, `Bob note ${TAG}`);

    expect((await getGlobalMemory(alice))?.notes).toBe(`Alice note ${TAG}`);
    expect((await getGlobalMemory(bob))?.notes).toBe(`Bob note ${TAG}`);
  });

  it("lists only the caller's exercise notes", async () => {
    await setExerciseMemory(aliceExercise, "Alice on bench");
    await setExerciseMemory(bobExercise, "Bob on bench");

    const forAlice = await listExerciseMemory(alice);
    const forBob = await listExerciseMemory(bob);

    expect(forAlice.some((m) => m.notes === "Alice on bench")).toBe(true);
    expect(forAlice.some((m) => m.notes === "Bob on bench")).toBe(false);
    expect(forBob.map((m) => m.notes)).toEqual(["Bob on bench"]);
  });
});
