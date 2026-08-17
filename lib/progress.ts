import { countHardSets, type LoggedSet } from "./volume";

/**
 * Pure progress analytics.
 *
 * Kept free of Prisma so every number here is unit-testable without a database,
 * and so the arithmetic happens in tested TypeScript rather than in the model.
 * Handing a chatbot eight weeks of raw sets and asking it to spot a plateau is
 * exactly the kind of work language models are least reliable at, and it burns
 * a great deal of context to do badly.
 */

/** One session's worth of logged sets for a single exercise. */
export interface SessionEntry {
  date: Date | string;
  sets: LoggedSet[];
}

export interface BestSet {
  weightKg: number | null;
  reps: number;
  estimatedOneRepMax: number | null;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toDayString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/**
 * Epley estimate of a one-rep max: `w * (1 + reps / 30)`.
 *
 * Chosen over Brzycki because Brzycki's denominator collapses as reps approach
 * 37, which turns a high-rep bodyweight-ish set into a nonsensical number.
 * Epley degrades gracefully and agrees closely with Brzycki in the 1-10 range
 * where nearly all real sets live.
 *
 * Returns null when there is no weight to reason about. Bodyweight work logs a
 * null weight, and treating that as 0 kg would report every push-up session as
 * a 1RM of zero and drag every trend downward.
 */
export function estimatedOneRepMax(
  weightKg: number | null,
  reps: number | null,
): number | null {
  if (weightKg === null || reps === null || reps <= 0 || weightKg <= 0) {
    return null;
  }
  if (reps === 1) {
    return round(weightKg);
  }
  return round(weightKg * (1 + reps / 30));
}

/**
 * The best set in a session, ranked by estimated 1RM.
 *
 * When no set carries a weight (bodyweight work) the ranking falls back to
 * reps, so the summary still reports something meaningful rather than nothing.
 */
export function bestSet(sets: LoggedSet[]): BestSet | null {
  const performed = sets.filter((s) => s && s.reps !== null && s.reps > 0);
  if (performed.length === 0) {
    return null;
  }

  let best: BestSet | null = null;
  for (const set of performed) {
    const e1rm = estimatedOneRepMax(set.weight, set.reps);
    const candidate: BestSet = {
      weightKg: set.weight,
      reps: set.reps as number,
      estimatedOneRepMax: e1rm,
    };

    if (best === null) {
      best = candidate;
      continue;
    }

    // A set with a weight always beats one without: an unweighted entry carries
    // no load information, so ranking it above a real lift would hide the
    // heaviest work done.
    const bestHasLoad = best.estimatedOneRepMax !== null;
    const candidateHasLoad = candidate.estimatedOneRepMax !== null;

    if (candidateHasLoad && !bestHasLoad) {
      best = candidate;
    } else if (candidateHasLoad && bestHasLoad) {
      if (candidate.estimatedOneRepMax! > best.estimatedOneRepMax!) {
        best = candidate;
      }
    } else if (!candidateHasLoad && !bestHasLoad && candidate.reps > best.reps) {
      best = candidate;
    }
  }

  return best;
}

export interface Session {
  date: string;
  hardSets: number;
  best: BestSet | null;
}

/** Collapses raw log rows into one entry per date, newest last. */
export function toSessions(entries: SessionEntry[]): Session[] {
  return entries
    .map((entry) => ({
      date: toDayString(entry.date),
      hardSets: countHardSets(entry.sets),
      best: bestSet(entry.sets),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Least-squares slope in units per week.
 *
 * Regression rather than (last - first) / weeks because a single unusual
 * weigh-in at either endpoint would otherwise dominate the answer. Returns null
 * below two points, or when every point shares one date and the slope is
 * undefined.
 */
export function trendPerWeek(
  points: Array<{ date: Date | string; value: number }>,
): number | null {
  if (points.length < 2) {
    return null;
  }

  const xs = points.map((p) => new Date(toDayString(p.date)).getTime() / 86_400_000);
  const ys = points.map((p) => p.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xs.length; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  if (denominator === 0) {
    return null;
  }

  return round((numerator / denominator) * 7);
}

/**
 * Whether an exercise has stopped progressing.
 *
 * True when the best estimated 1RM of the three most recent sessions fails to
 * beat the best achieved in any earlier session in the window.
 *
 * Three sessions rather than two because a single deload week, or one bad night
 * of sleep, routinely produces a lower session; calling that a plateau after
 * two would flag almost every exercise almost all the time. Below four sessions
 * the question is not yet answerable, so it returns false rather than guessing.
 */
export function isStalled(sessions: Session[], recentCount = 3): boolean {
  const loaded = sessions.filter((s) => s.best?.estimatedOneRepMax != null);
  if (loaded.length < recentCount + 1) {
    return false;
  }

  const recent = loaded.slice(-recentCount);
  const earlier = loaded.slice(0, -recentCount);

  const bestRecent = Math.max(...recent.map((s) => s.best!.estimatedOneRepMax!));
  const bestEarlier = Math.max(...earlier.map((s) => s.best!.estimatedOneRepMax!));

  return bestRecent <= bestEarlier;
}

export interface ExerciseProgress {
  sessions: number;
  hardSets: number;
  firstSession: string | null;
  lastSession: string | null;
  bestSet: BestSet | null;
  firstOneRepMax: number | null;
  latestOneRepMax: number | null;
  oneRepMaxChange: number | null;
  oneRepMaxTrendPerWeek: number | null;
  stalled: boolean;
}

/** Everything the summary reports about one exercise. */
export function summariseExercise(entries: SessionEntry[]): ExerciseProgress {
  const sessions = toSessions(entries);
  const loaded = sessions.filter((s) => s.best?.estimatedOneRepMax != null);

  const first = loaded[0]?.best?.estimatedOneRepMax ?? null;
  const latest = loaded[loaded.length - 1]?.best?.estimatedOneRepMax ?? null;

  const allBest = sessions
    .map((s) => s.best)
    .filter((b): b is BestSet => b !== null);

  return {
    sessions: sessions.length,
    hardSets: sessions.reduce((sum, s) => sum + s.hardSets, 0),
    firstSession: sessions[0]?.date ?? null,
    lastSession: sessions[sessions.length - 1]?.date ?? null,
    bestSet:
      allBest.length === 0
        ? null
        : allBest.reduce((best, candidate) =>
            (candidate.estimatedOneRepMax ?? -1) > (best.estimatedOneRepMax ?? -1)
              ? candidate
              : best,
          ),
    firstOneRepMax: first,
    latestOneRepMax: latest,
    oneRepMaxChange: first !== null && latest !== null ? round(latest - first) : null,
    oneRepMaxTrendPerWeek: trendPerWeek(
      loaded.map((s) => ({ date: s.date, value: s.best!.estimatedOneRepMax! })),
    ),
    stalled: isStalled(sessions),
  };
}
