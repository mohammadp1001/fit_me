/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import {
  addPersonal,
  findByName,
  findBySlug,
  hide,
  materialise,
  override,
  resolveLibrary,
  unhide,
} from "./library";

const prisma = new PrismaClient();

const TAG = Date.now();
let alice: number;
let bob: number;

/** A real catalog slug, so the tests exercise the shipped content. */
const SLUG = "barbell_squat";

beforeAll(async () => {
  const a = await prisma.user.create({
    data: {
      name: "Library Alice",
      username: `lib-alice-${TAG}`,
      passwordHash: "x",
      weightKg: 80,
      heightCm: 180,
    },
  });
  const b = await prisma.user.create({
    data: {
      name: "Library Bob",
      username: `lib-bob-${TAG}`,
      passwordHash: "x",
      weightKg: 70,
      heightCm: 170,
    },
  });
  alice = a.id;
  bob = b.id;

  const seeded = await prisma.exerciseCatalog.count();
  if (seeded === 0) {
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

describe("a library is the catalog plus additions minus hides", () => {
  it("gives a brand-new account the whole catalog with no rows of its own", async () => {
    const library = await resolveLibrary(alice);
    const catalogCount = await prisma.exerciseCatalog.count();

    expect(library).toHaveLength(catalogCount);
    // The point of the overlay: nothing was copied at signup.
    expect(await prisma.exercise.count({ where: { userId: alice } })).toBe(0);
  });

  it("includes a personal addition alongside the catalog", async () => {
    const name = `Alice Invention ${TAG}`;
    await addPersonal(alice, { name, musclesPrimary: ["lats"] });

    const forAlice = await resolveLibrary(alice);
    const forBob = await resolveLibrary(bob);

    expect(forAlice.some((e) => e.name === name)).toBe(true);
    expect(forBob.some((e) => e.name === name)).toBe(false);
  });

  it("removes a hidden catalog exercise from that account only", async () => {
    await hide(alice, SLUG);

    expect(await findBySlug(alice, SLUG)).toBeNull();
    expect(await findBySlug(bob, SLUG)).not.toBeNull();

    const forAlice = await resolveLibrary(alice);
    expect(forAlice.some((e) => e.slug === SLUG)).toBe(false);
  });

  it("restores a hidden exercise", async () => {
    await hide(alice, SLUG);
    await unhide(alice, SLUG);
    expect(await findBySlug(alice, SLUG)).not.toBeNull();
  });
});

describe("materialising", () => {
  it("creates the row only when the exercise is actually used", async () => {
    expect(await prisma.exercise.count({ where: { userId: alice } })).toBe(0);

    // Merely reading must not litter the account with rows.
    await findBySlug(alice, SLUG);
    await resolveLibrary(alice);
    expect(await prisma.exercise.count({ where: { userId: alice } })).toBe(0);

    const id = await materialise(alice, SLUG);
    expect(await prisma.exercise.count({ where: { userId: alice } })).toBe(1);
    expect(await materialise(alice, SLUG)).toBe(id);
  });

  it("leaves the row inheriting, so it still reads from the catalog", async () => {
    await materialise(alice, SLUG);

    const row = await prisma.exercise.findFirstOrThrow({
      where: { userId: alice, catalogSlug: SLUG },
    });
    expect(row.name).toBeNull();

    const entry = await findBySlug(alice, SLUG);
    const catalog = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });
    expect(entry?.name).toBe(catalog.name);
    expect(entry?.source).toBe("catalog");
  });

  // Using an exercise again says more than the hide did.
  it("un-hides an exercise that is used again", async () => {
    await hide(alice, SLUG);
    await materialise(alice, SLUG);
    expect(await findBySlug(alice, SLUG)).not.toBeNull();
  });
});

describe("catalog corrections", () => {
  // The whole reason copies were rejected: a correction has to reach people.
  it("reach an inherited row with no per-user action", async () => {
    await materialise(alice, SLUG);
    const before = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });

    try {
      await prisma.exerciseCatalog.update({
        where: { slug: SLUG },
        data: { musclesSecondary: ["erector_spinae"] },
      });

      const entry = await findBySlug(alice, SLUG);
      expect(entry?.musclesSecondary).toEqual(["erector_spinae"]);
    } finally {
      await prisma.exerciseCatalog.update({
        where: { slug: SLUG },
        data: { musclesSecondary: before.musclesSecondary },
      });
    }
  });

  // An override is a deliberate statement that the catalog is wrong for you,
  // so it is frozen on purpose.
  it("do not reach a row the user has overridden", async () => {
    await override(alice, SLUG, {
      name: `My Squat ${TAG}`,
      musclesPrimary: ["quadriceps"],
    });
    const before = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });

    try {
      await prisma.exerciseCatalog.update({
        where: { slug: SLUG },
        data: { musclesPrimary: ["hamstrings"] },
      });

      const entry = await findBySlug(alice, SLUG);
      expect(entry?.musclesPrimary).toEqual(["quadriceps"]);
      expect(entry?.source).toBe("override");
    } finally {
      await prisma.exerciseCatalog.update({
        where: { slug: SLUG },
        data: { musclesPrimary: before.musclesPrimary },
      });
    }
  });
});

describe("overrides", () => {
  it("apply to one account and leave everyone else alone", async () => {
    await override(alice, SLUG, {
      name: `My Squat ${TAG}`,
      musclesPrimary: ["glute_max"],
    });

    const forAlice = await findBySlug(alice, SLUG);
    const forBob = await findBySlug(bob, SLUG);

    expect(forAlice?.name).toBe(`My Squat ${TAG}`);
    expect(forAlice?.musclesPrimary).toEqual(["glute_max"]);
    expect(forBob?.name).toBe("Barbell Squat");
    expect(forBob?.source).toBe("catalog");
  });

  // Overriding one field must not blank the rest.
  it("keep the catalog's other fields when only one is changed", async () => {
    const catalog = await prisma.exerciseCatalog.findUniqueOrThrow({
      where: { slug: SLUG },
    });
    await override(alice, SLUG, { name: catalog.name, musclesPrimary: ["glute_max"] });

    const entry = await findBySlug(alice, SLUG);
    expect(entry?.description).toBe(catalog.description);
    expect(entry?.musclesSecondary).toEqual(catalog.musclesSecondary);
  });

  it("refuse a slug that is not in the catalog", async () => {
    await expect(
      override(alice, "not_a_real_slug", { name: "x" }),
    ).rejects.toThrow(/No catalog exercise/);
  });
});

describe("lookup by name", () => {
  it("finds a catalog exercise the account has never touched", async () => {
    const entry = await findByName(alice, "Barbell Squat");
    expect(entry?.slug).toBe(SLUG);
    expect(entry?.exerciseId).toBeNull();
  });

  it("is case-insensitive and trims", async () => {
    expect((await findByName(alice, "  barbell squat "))?.slug).toBe(SLUG);
  });

  it("prefers the account's own addition over a catalog entry", async () => {
    const id = await addPersonal(alice, {
      name: "Barbell Squat",
      musclesPrimary: ["glute_max"],
    });

    const entry = await findByName(alice, "Barbell Squat");
    expect(entry?.exerciseId).toBe(id);
    expect(entry?.source).toBe("personal");
  });

  it("does not find a hidden exercise", async () => {
    await hide(alice, SLUG);
    expect(await findByName(alice, "Barbell Squat")).toBeNull();
  });

  it("returns null for a name nobody has", async () => {
    expect(await findByName(alice, `Nonexistent ${TAG}`)).toBeNull();
  });
});
