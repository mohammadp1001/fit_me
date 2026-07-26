import { Muscle } from "@prisma/client";
import {
  ALL_MUSCLES,
  MUSCLE_GROUP,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABEL,
  MUSCLE_LABEL,
  isMuscle,
  suggestMuscle,
  verdictForVolume,
  WEEKLY_SET_FLOOR,
  WEEKLY_SET_CEILING,
} from "./muscles";

describe("taxonomy completeness", () => {
  const enumMembers = Object.values(Muscle) as Muscle[];

  it("covers every Prisma enum member with a group", () => {
    // Copy before sorting: ALL_MUSCLES is exported and shared, and `.sort()`
    // would reorder it in place for every other consumer in the process.
    expect([...ALL_MUSCLES].sort()).toEqual([...enumMembers].sort());
  });

  it("covers every Prisma enum member with bilingual labels", () => {
    for (const muscle of enumMembers) {
      expect(MUSCLE_LABEL[muscle]?.fa).toBeTruthy();
      expect(MUSCLE_LABEL[muscle]?.en).toBeTruthy();
    }
  });

  it("maps every muscle to a known group", () => {
    for (const muscle of enumMembers) {
      expect(MUSCLE_GROUPS).toContain(MUSCLE_GROUP[muscle]);
    }
  });

  it("labels every group in both languages", () => {
    for (const group of MUSCLE_GROUPS) {
      expect(MUSCLE_GROUP_LABEL[group]?.fa).toBeTruthy();
      expect(MUSCLE_GROUP_LABEL[group]?.en).toBeTruthy();
    }
  });

  it("uses every declared group at least once", () => {
    const used = new Set(enumMembers.map((m) => MUSCLE_GROUP[m]));
    expect([...MUSCLE_GROUPS].filter((g) => !used.has(g))).toEqual([]);
  });

  it("has no duplicate English labels", () => {
    const labels = enumMembers.map((m) => MUSCLE_LABEL[m].en);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("isMuscle", () => {
  it("accepts canonical keys", () => {
    expect(isMuscle("lats")).toBe(true);
  });

  it("rejects free text and inherited object keys", () => {
    expect(isMuscle("Chest")).toBe(false);
    expect(isMuscle("toString")).toBe(false);
  });
});

describe("suggestMuscle", () => {
  it("recovers from a typo", () => {
    expect(suggestMuscle("latts")).toBe("lats");
  });

  it("matches an English display label", () => {
    expect(suggestMuscle("Biceps")).toBe("biceps_brachii");
  });

  it("matches a spaced form of the key", () => {
    expect(suggestMuscle("glute max")).toBe("glute_max");
  });

  it("returns null when nothing is close", () => {
    expect(suggestMuscle("xyzzy-not-a-muscle-at-all")).toBeNull();
  });
});

describe("verdictForVolume", () => {
  it("reads below the floor as low", () => {
    expect(verdictForVolume(WEEKLY_SET_FLOOR - 0.5)).toBe("low");
  });

  it("treats the floor and ceiling as adequate", () => {
    expect(verdictForVolume(WEEKLY_SET_FLOOR)).toBe("adequate");
    expect(verdictForVolume(WEEKLY_SET_CEILING)).toBe("adequate");
  });

  it("reads above the ceiling as high", () => {
    expect(verdictForVolume(WEEKLY_SET_CEILING + 0.5)).toBe("high");
  });
});
