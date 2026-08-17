/**
 * @jest-environment node
 */
import {
  bestSet,
  estimatedOneRepMax,
  isStalled,
  summariseExercise,
  toSessions,
  trendPerWeek,
} from "./progress";

describe("estimatedOneRepMax", () => {
  it("returns the weight itself for a single", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it("applies the Epley formula", () => {
    // 100 * (1 + 10/30) = 133.33
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.33, 2);
  });

  it("returns null for bodyweight work rather than zero", () => {
    // A null weight means "not recorded", not "no load". Treating it as 0 would
    // report a push-up session as a 1RM of zero and drag every trend down.
    expect(estimatedOneRepMax(null, 20)).toBeNull();
  });

  it("returns null for a set that was not performed", () => {
    expect(estimatedOneRepMax(100, 0)).toBeNull();
    expect(estimatedOneRepMax(100, null)).toBeNull();
  });
});

describe("bestSet", () => {
  it("picks the highest estimated 1RM, not the heaviest weight", () => {
    const best = bestSet([
      { weight: 100, reps: 3 }, // 110
      { weight: 90, reps: 8 }, // 114
    ]);

    expect(best).toMatchObject({ weightKg: 90, reps: 8 });
  });

  it("ignores sets with no reps recorded", () => {
    const best = bestSet([
      { weight: 200, reps: null },
      { weight: 50, reps: 5 },
    ]);

    expect(best).toMatchObject({ weightKg: 50 });
  });

  it("prefers a weighted set over a bodyweight one", () => {
    const best = bestSet([
      { weight: null, reps: 30 },
      { weight: 40, reps: 5 },
    ]);

    expect(best).toMatchObject({ weightKg: 40 });
  });

  it("falls back to reps when nothing carries a weight", () => {
    const best = bestSet([
      { weight: null, reps: 12 },
      { weight: null, reps: 20 },
    ]);

    expect(best).toMatchObject({ reps: 20, estimatedOneRepMax: null });
  });

  it("returns null when no set was performed", () => {
    expect(bestSet([{ weight: 100, reps: null }])).toBeNull();
    expect(bestSet([])).toBeNull();
  });
});

describe("toSessions", () => {
  it("orders sessions oldest first regardless of input order", () => {
    const sessions = toSessions([
      { date: "2026-08-10", sets: [{ weight: 50, reps: 5 }] },
      { date: "2026-08-01", sets: [{ weight: 40, reps: 5 }] },
    ]);

    expect(sessions.map((s) => s.date)).toEqual(["2026-08-01", "2026-08-10"]);
  });

  it("counts hard sets per session", () => {
    const [session] = toSessions([
      {
        date: "2026-08-01",
        sets: [
          { weight: 50, reps: 5 },
          { weight: 50, reps: 5 },
          { weight: null, reps: null },
        ],
      },
    ]);

    expect(session.hardSets).toBe(2);
  });
});

describe("trendPerWeek", () => {
  it("reports a steady gain per week", () => {
    const trend = trendPerWeek([
      { date: "2026-08-01", value: 80 },
      { date: "2026-08-08", value: 81 },
      { date: "2026-08-15", value: 82 },
    ]);

    expect(trend).toBeCloseTo(1, 5);
  });

  it("reports a loss as negative", () => {
    const trend = trendPerWeek([
      { date: "2026-08-01", value: 82 },
      { date: "2026-08-15", value: 80 },
    ]);

    expect(trend).toBeCloseTo(-1, 5);
  });

  it("is not dominated by a single outlier endpoint", () => {
    // Least squares rather than (last - first): one odd weigh-in should not
    // rewrite the whole trend.
    const clean = trendPerWeek([
      { date: "2026-08-01", value: 80 },
      { date: "2026-08-08", value: 80 },
      { date: "2026-08-15", value: 80 },
      { date: "2026-08-22", value: 80 },
    ]);
    const withOutlier = trendPerWeek([
      { date: "2026-08-01", value: 80 },
      { date: "2026-08-08", value: 80 },
      { date: "2026-08-15", value: 80 },
      { date: "2026-08-22", value: 84 },
    ]);

    expect(clean).toBe(0);

    // The naive reading is (84 - 80) over 3 weeks = 1.33 kg/week, driven
    // entirely by the last point. Regression discounts it to 1.2 because the
    // three flat weeks before it also get a vote.
    const naiveEndpointSlope = (84 - 80) / 3;
    expect(withOutlier).toBeLessThan(naiveEndpointSlope);
    expect(withOutlier).toBeCloseTo(1.2, 5);
  });

  it("returns null below two points", () => {
    expect(trendPerWeek([{ date: "2026-08-01", value: 80 }])).toBeNull();
    expect(trendPerWeek([])).toBeNull();
  });

  it("returns null when every point shares a date", () => {
    expect(
      trendPerWeek([
        { date: "2026-08-01", value: 80 },
        { date: "2026-08-01", value: 82 },
      ]),
    ).toBeNull();
  });
});

describe("isStalled", () => {
  function session(date: string, weight: number) {
    return { date, sets: [{ weight, reps: 5 }] };
  }

  it("is false while the lift is still climbing", () => {
    const sessions = toSessions([
      session("2026-08-01", 60),
      session("2026-08-08", 62),
      session("2026-08-15", 64),
      session("2026-08-22", 66),
    ]);

    expect(isStalled(sessions)).toBe(false);
  });

  it("is true when the last three sessions beat nothing earlier", () => {
    const sessions = toSessions([
      session("2026-08-01", 70),
      session("2026-08-08", 70),
      session("2026-08-15", 68),
      session("2026-08-22", 70),
    ]);

    expect(isStalled(sessions)).toBe(true);
  });

  it("is false when only one recent session dipped", () => {
    // A single deload or bad night is not a plateau. Flagging on two sessions
    // would mark almost every exercise almost always.
    const sessions = toSessions([
      session("2026-08-01", 60),
      session("2026-08-08", 62),
      session("2026-08-15", 61),
      session("2026-08-22", 65),
    ]);

    expect(isStalled(sessions)).toBe(false);
  });

  it("is false when there is not enough history to answer", () => {
    const sessions = toSessions([
      session("2026-08-01", 60),
      session("2026-08-08", 60),
      session("2026-08-15", 60),
    ]);

    expect(isStalled(sessions)).toBe(false);
  });

  it("ignores bodyweight sessions that carry no load", () => {
    const sessions = toSessions([
      { date: "2026-08-01", sets: [{ weight: null, reps: 20 }] },
      { date: "2026-08-08", sets: [{ weight: null, reps: 22 }] },
      { date: "2026-08-15", sets: [{ weight: null, reps: 25 }] },
      { date: "2026-08-22", sets: [{ weight: null, reps: 28 }] },
    ]);

    expect(isStalled(sessions)).toBe(false);
  });
});

describe("summariseExercise", () => {
  it("summarises a progressing lift", () => {
    const summary = summariseExercise([
      { date: "2026-08-01", sets: [{ weight: 60, reps: 5 }, { weight: 60, reps: 5 }] },
      { date: "2026-08-08", sets: [{ weight: 62.5, reps: 5 }] },
      { date: "2026-08-15", sets: [{ weight: 65, reps: 5 }] },
    ]);

    expect(summary.sessions).toBe(3);
    expect(summary.hardSets).toBe(4);
    expect(summary.firstSession).toBe("2026-08-01");
    expect(summary.lastSession).toBe("2026-08-15");
    expect(summary.bestSet).toMatchObject({ weightKg: 65, reps: 5 });
    expect(summary.oneRepMaxChange).toBeGreaterThan(0);
    expect(summary.stalled).toBe(false);
  });

  it("reports nulls rather than zeros for an exercise with no loaded work", () => {
    const summary = summariseExercise([
      { date: "2026-08-01", sets: [{ weight: null, reps: 15 }] },
    ]);

    expect(summary.sessions).toBe(1);
    expect(summary.latestOneRepMax).toBeNull();
    expect(summary.oneRepMaxChange).toBeNull();
    expect(summary.oneRepMaxTrendPerWeek).toBeNull();
    expect(summary.bestSet).toMatchObject({ reps: 15 });
  });

  it("handles an empty history without throwing", () => {
    const summary = summariseExercise([]);

    expect(summary).toMatchObject({
      sessions: 0,
      hardSets: 0,
      firstSession: null,
      bestSet: null,
      stalled: false,
    });
  });
});
