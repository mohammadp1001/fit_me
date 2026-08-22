/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { getCatalogEntry, readCatalogFile, seedCatalog } from "./catalog";
import { ALL_MUSCLES } from "@/lib/muscles";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * The catalog is the shared source of truth for what an exercise is, and its
 * muscle tags feed the volume chart. Wrong content here is worse than missing
 * content, so the checked-in file is validated rather than trusted.
 */
describe("the checked-in catalog file", () => {
  const entries = readCatalogFile();

  it("is comprehensive - far more than the ~30 seeded exercises it replaces", () => {
    expect(entries.length).toBeGreaterThan(500);
  });

  it("gives every entry a unique, slug-shaped id", () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("draws every muscle from the closed vocabulary", () => {
    const valid = new Set<string>(ALL_MUSCLES);
    for (const entry of entries) {
      for (const m of [...entry.musclesPrimary, ...entry.musclesSecondary]) {
        expect(valid.has(m)).toBe(true);
      }
    }
  });

  // An exercise with no primary muscle cannot contribute to volume, so it
  // would be dead weight in the library.
  it("gives every entry at least one primary muscle", () => {
    for (const entry of entries) {
      expect(entry.musclesPrimary.length).toBeGreaterThan(0);
    }
  });

  it("never repeats a primary muscle in the secondary list", () => {
    for (const entry of entries) {
      for (const m of entry.musclesSecondary) {
        expect(entry.musclesPrimary).not.toContain(m);
      }
    }
  });

  it("still contains the staples a program will actually reference", () => {
    const slugs = new Set(entries.map((e) => e.slug));
    expect(slugs.has("barbell_squat")).toBe(true);
    expect(slugs.has("barbell_deadlift")).toBe(true);
    expect([...slugs].some((s) => s.includes("bench_press"))).toBe(true);
  });
});

describe("catalog validation refuses bad content", () => {
  function fileWith(entries: unknown[]): string {
    const dir = mkdtempSync(join(tmpdir(), "catalog-"));
    const path = join(dir, "exercises.json");
    writeFileSync(path, JSON.stringify(entries), "utf8");
    return path;
  }

  const good = {
    slug: "ok_exercise",
    name: "Ok Exercise",
    musclesPrimary: ["lats"],
    musclesSecondary: [],
    description: "",
    equipment: "",
    level: "",
    mechanic: "",
    force: "",
  };

  // The last point before these values reach a column the volume chart depends
  // on. A bad tag must fail loudly here, not be discovered as a wrong number
  // months later.
  it("rejects an invented muscle name", () => {
    const path = fileWith([{ ...good, musclesPrimary: ["biceps_peak"] }]);
    expect(() => readCatalogFile(path)).toThrow(/unknown muscle/i);
  });

  it("rejects a duplicate slug", () => {
    const path = fileWith([good, good]);
    expect(() => readCatalogFile(path)).toThrow(/duplicate slug/i);
  });

  it("rejects a slug that is not slug-shaped", () => {
    const path = fileWith([{ ...good, slug: "Barbell Squat" }]);
    expect(() => readCatalogFile(path)).toThrow(/invalid slug/i);
  });

  it("rejects an entry with no primary muscle", () => {
    const path = fileWith([{ ...good, musclesPrimary: [] }]);
    expect(() => readCatalogFile(path)).toThrow(/no primary muscle/i);
  });
});

describe("seeding the catalog", () => {
  const sample = [
    {
      slug: `seed_test_${Date.now()}`,
      name: "Seed Test Lift",
      musclesPrimary: ["lats" as const],
      musclesSecondary: ["biceps_brachii" as const],
      description: "Pull.",
      equipment: "barbell",
      level: "beginner",
      mechanic: "compound",
      force: "pull",
    },
  ];

  afterAll(async () => {
    await prisma.exerciseCatalog.deleteMany({
      where: { slug: { startsWith: "seed_test_" } },
    });
  });

  it("writes an entry and can be run again without changing anything", async () => {
    await seedCatalog(sample);
    const first = await getCatalogEntry(sample[0].slug);
    expect(first?.name).toBe("Seed Test Lift");
    expect(first?.musclesPrimary).toEqual(["lats"]);

    await seedCatalog(sample);
    const second = await prisma.exerciseCatalog.findMany({
      where: { slug: sample[0].slug },
    });
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(first);
  });

  // Tips, mistakes and a video link are empty in the import and exist to be
  // filled in by hand. Re-seeding must not wipe that work.
  it("does not overwrite hand-curated fields on re-seed", async () => {
    await seedCatalog(sample);
    await prisma.exerciseCatalog.update({
      where: { slug: sample[0].slug },
      data: {
        tips: ["Keep your chest up."],
        videoUrl: "https://example.invalid/clip",
      },
    });

    await seedCatalog(sample);

    const after = await getCatalogEntry(sample[0].slug);
    expect(after?.tips).toEqual(["Keep your chest up."]);
    expect(after?.videoUrl).toBe("https://example.invalid/clip");
  });
});
