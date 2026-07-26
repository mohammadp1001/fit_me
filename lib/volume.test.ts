import {
  countHardSets,
  toLoggedSets,
  isWithinWindow,
  volumeByGroup,
  groupsForExercise,
  VOLUME_WINDOW_DAYS,
  type VolumeEntry,
} from "./volume";

const NOW = "2026-07-26";

function entry(overrides: Partial<VolumeEntry> = {}): VolumeEntry {
  return {
    date: NOW,
    sets: [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
    ],
    musclesPrimary: ["lats"],
    musclesSecondary: [],
    ...overrides,
  };
}

describe("countHardSets", () => {
  it("counts sets that record reps", () => {
    expect(
      countHardSets([
        { weight: 60, reps: 10 },
        { weight: 65, reps: 8 },
      ])
    ).toBe(2);
  });

  it("counts bodyweight sets, which carry a null weight", () => {
    expect(countHardSets([{ weight: null, reps: 12 }])).toBe(1);
  });

  it("ignores unperformed placeholder sets", () => {
    expect(
      countHardSets([
        { weight: 60, reps: 10 },
        { weight: null, reps: null },
        { weight: 60, reps: 0 },
      ])
    ).toBe(1);
  });
});

describe("toLoggedSets", () => {
  it("passes through well-formed sets", () => {
    expect(toLoggedSets([{ weight: 60, reps: 10 }])).toEqual([
      { weight: 60, reps: 10 },
    ]);
  });

  it("returns an empty list for a non-array JSON value", () => {
    expect(toLoggedSets(null)).toEqual([]);
    expect(toLoggedSets(undefined)).toEqual([]);
    expect(toLoggedSets({ weight: 60 })).toEqual([]);
  });

  it("drops non-object entries and normalises bad field types to null", () => {
    expect(toLoggedSets([null, "x", { weight: "60", reps: 10 }])).toEqual([
      { weight: null, reps: 10 },
    ]);
  });

  it("feeds countHardSets safely from malformed JSON", () => {
    expect(countHardSets(toLoggedSets("not an array"))).toBe(0);
  });
});

describe("isWithinWindow", () => {
  it("includes today and the far edge of the window", () => {
    expect(isWithinWindow("2026-07-26", NOW)).toBe(true);
    expect(isWithinWindow("2026-07-20", NOW)).toBe(true);
  });

  it("excludes the day just outside the window", () => {
    expect(isWithinWindow("2026-07-19", NOW)).toBe(false);
  });

  it("excludes future-dated logs", () => {
    expect(isWithinWindow("2026-07-27", NOW)).toBe(false);
  });

  it("spans exactly VOLUME_WINDOW_DAYS days", () => {
    const days = [...Array(VOLUME_WINDOW_DAYS + 2).keys()].filter((offset) => {
      const d = new Date("2026-07-26T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - offset);
      return isWithinWindow(d, NOW);
    });
    expect(days).toHaveLength(VOLUME_WINDOW_DAYS);
  });
});

describe("volumeByGroup", () => {
  it("credits primary movers at full weight", () => {
    const totals = volumeByGroup([entry()], NOW);
    expect(totals.back).toBe(2);
  });

  it("credits secondary movers at half weight", () => {
    const totals = volumeByGroup(
      [entry({ musclesPrimary: ["lats"], musclesSecondary: ["biceps_brachii"] })],
      NOW
    );
    expect(totals.back).toBe(2);
    expect(totals.arms).toBe(1);
  });

  it("counts a set once per group, not once per tagged muscle", () => {
    // `lats` and `rhomboids` both roll up to `back`. Tagging an exercise more
    // finely must not multiply its volume.
    const totals = volumeByGroup(
      [entry({ musclesPrimary: ["lats", "rhomboids", "teres_major"] })],
      NOW
    );
    expect(totals.back).toBe(2);
  });

  it("takes the highest role weight when a group appears in both roles", () => {
    const totals = volumeByGroup(
      [entry({ musclesPrimary: ["lats"], musclesSecondary: ["rhomboids"] })],
      NOW
    );
    expect(totals.back).toBe(2);
  });

  it("ignores logs outside the window", () => {
    const totals = volumeByGroup([entry({ date: "2026-07-01" })], NOW);
    expect(totals.back).toBe(0);
  });

  it("ignores logs with no performed sets", () => {
    const totals = volumeByGroup(
      [entry({ sets: [{ weight: null, reps: null }] })],
      NOW
    );
    expect(totals.back).toBe(0);
  });

  it("accumulates across sessions", () => {
    const totals = volumeByGroup(
      [entry({ date: "2026-07-26" }), entry({ date: "2026-07-23" })],
      NOW
    );
    expect(totals.back).toBe(4);
  });

  it("returns every group, defaulting to zero", () => {
    const totals = volumeByGroup([], NOW);
    expect(totals.chest).toBe(0);
    expect(totals.calves).toBe(0);
  });
});

describe("groupsForExercise", () => {
  it("dedupes groups across both roles", () => {
    expect(groupsForExercise(["lats", "rhomboids"], ["biceps_brachii"])).toEqual([
      "back",
      "arms",
    ]);
  });
});
