/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import {
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
const SHARED_NAME = `Shared Bench ${TAG}`;

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
  // globally-unique `name` made impossible.
  const a = await prisma.exercise.create({
    data: {
      userId: alice,
      name: SHARED_NAME,
      musclesPrimary: ["pec_major_sternal"],
    },
  });
  aliceExercise = a.id;

  const b = await prisma.exercise.create({
    data: {
      userId: bob,
      name: SHARED_NAME,
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
  it("lets two accounts own the same exercise name", async () => {
    // The whole reason `name @unique` became `@@unique([userId, name])`.
    const both = await prisma.exercise.findMany({ where: { name: SHARED_NAME } });

    expect(both).toHaveLength(2);
    expect(new Set(both.map((e) => e.userId))).toEqual(new Set([alice, bob]));
  });

  it("resolves each account to its own row for the same name", async () => {
    const forAlice = await resolveExerciseStrict(alice, SHARED_NAME);
    const forBob = await resolveExerciseStrict(bob, SHARED_NAME);

    expect(forAlice.exerciseId).toBe(aliceExercise);
    expect(forBob.exerciseId).toBe(bobExercise);
    expect(forAlice.exerciseId).not.toBe(forBob.exerciseId);
  });

  it("does not see another account's exercise at all", async () => {
    const onlyBobHas = `Bob Only ${TAG}`;
    const created = await prisma.exercise.create({
      data: {
        userId: bob,
        name: onlyBobHas,
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
        name: bobOnly,
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
      expect(error!.suggestions.every((s) => s.exerciseId !== created.id)).toBe(true);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
  });

  it("scopes the name constraint to one account, not the table", async () => {
    // Two rows sharing a name across *different* accounts is normal. A second
    // row with that name inside *one* account is what the constraint refuses -
    // which is also why the resolver no longer needs an ambiguity case.
    await expect(resolveExerciseStrict(alice, SHARED_NAME)).resolves.toMatchObject(
      { exerciseId: aliceExercise },
    );
    await expect(resolveExerciseStrict(bob, SHARED_NAME)).resolves.toMatchObject(
      { exerciseId: bobExercise },
    );

    await expect(
      prisma.exercise.create({
        data: {
          userId: alice,
          name: SHARED_NAME,
          musclesPrimary: ["lats"],
        },
      }),
    ).rejects.toThrow();
  });

  // A library is the shared catalog plus the account's own additions, so both
  // accounts legitimately see the same hundreds of catalog exercises. What must
  // never cross is a personal one.
  it("shows each account its own additions and never the other's", async () => {
    const aliceOnly = `Alice Only ${TAG}`;
    const created = await prisma.exercise.create({
      data: { userId: alice, name: aliceOnly, musclesPrimary: ["lats"] },
    });

    try {
      const forAlice = await listExercises(alice, { limit: 5000 });
      const forBob = await listExercises(bob, { limit: 5000 });

      expect(forAlice.some((e) => e.name === aliceOnly)).toBe(true);
      expect(forBob.some((e) => e.name === aliceOnly)).toBe(false);

      // Both still see the shared catalog, which is the point of having one.
      expect(forAlice.length).toBeGreaterThan(100);
      expect(forBob.length).toBeGreaterThan(100);
    } finally {
      await prisma.exercise.delete({ where: { id: created.id } });
    }
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
      name: "Hijacked",
    });

    expect(result).toBeNull();

    const untouched = await prisma.exercise.findUnique({
      where: { id: bobExercise },
    });
    expect(untouched!.name).toBe(SHARED_NAME);
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
