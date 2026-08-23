/**
 * What would change if the user approved a proposed program.
 *
 * A raw YAML dump is not a decision aid. The user is being asked to replace
 * what they are currently following, and the only question they actually have
 * is "what is different?" - which exercises are new, which are gone, and which
 * changed sets or reps. Everything here exists to answer that at a glance.
 *
 * Pure on purpose: the comparison rules are the fiddly part, and they are worth
 * testing without a database in the way.
 */

export interface DiffExercise {
  /** Durable identity. Two slots for the same lift compare as the same lift. */
  exerciseId: number;
  name: string;
  sets: number;
  reps: number[];
  note: string;
}

export interface DiffDay {
  name: string;
  exercises: DiffExercise[];
}

export interface DiffProgram {
  name: string;
  days: DiffDay[];
}

export type ExerciseChange =
  | { kind: "added"; name: string; sets: number; reps: number[]; note: string }
  | { kind: "removed"; name: string; sets: number; reps: number[] }
  | {
      kind: "changed";
      name: string;
      from: { sets: number; reps: number[] };
      to: { sets: number; reps: number[] };
      note: string;
    }
  | { kind: "unchanged"; name: string; sets: number; reps: number[] };

export interface DayChange {
  name: string;
  /** `renamed` carries the old name so the user recognises the day. */
  previousName: string | null;
  kind: "added" | "removed" | "changed" | "unchanged";
  exercises: ExerciseChange[];
}

export interface ProgramDiff {
  programName: { from: string; to: string; changed: boolean };
  days: DayChange[];
  /** Headline counts, so the screen can say "3 new, 1 dropped" without maths. */
  totals: { added: number; removed: number; changed: number; unchanged: number };
  /** True when approving would change nothing at all. */
  identical: boolean;
}

const sameReps = (a: number[], b: number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Pairs up days between the two programs.
 *
 * By name first, because a renamed day is rare and a reordered one is not -
 * matching purely by position would report a whole day as removed and another
 * as added just because the split was resequenced. Leftovers then pair by
 * position, which catches the rename case while keeping the ordering intact.
 */
function pairDays(
  before: DiffDay[],
  after: DiffDay[],
): Array<[DiffDay | null, DiffDay | null]> {
  const usedBefore = new Set<number>();
  const pairs: Array<[DiffDay | null, DiffDay | null]> = [];

  const byName = new Map<string, number[]>();
  before.forEach((day, i) => {
    const key = day.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), i]);
  });

  const matchedAfter = new Map<number, number>();
  after.forEach((day, j) => {
    const key = day.name.trim().toLowerCase();
    const candidates = byName.get(key);
    const i = candidates?.find((idx) => !usedBefore.has(idx));
    if (i !== undefined) {
      usedBefore.add(i);
      matchedAfter.set(j, i);
    }
  });

  // Unmatched days pair off in order, which reads as a rename rather than a
  // simultaneous add and remove.
  const leftoverBefore = before
    .map((_, i) => i)
    .filter((i) => !usedBefore.has(i));
  const leftoverAfter = after.map((_, j) => j).filter((j) => !matchedAfter.has(j));
  leftoverAfter.forEach((j, k) => {
    const i = leftoverBefore[k];
    if (i !== undefined) {
      usedBefore.add(i);
      matchedAfter.set(j, i);
    }
  });

  after.forEach((day, j) => {
    const i = matchedAfter.get(j);
    pairs.push([i === undefined ? null : before[i], day]);
  });
  before.forEach((day, i) => {
    if (!usedBefore.has(i)) pairs.push([day, null]);
  });

  return pairs;
}

function diffExercises(
  before: DiffExercise[],
  after: DiffExercise[],
): ExerciseChange[] {
  const beforeById = new Map(before.map((e) => [e.exerciseId, e]));
  const afterIds = new Set(after.map((e) => e.exerciseId));
  const changes: ExerciseChange[] = [];

  for (const e of after) {
    const was = beforeById.get(e.exerciseId);
    if (!was) {
      changes.push({
        kind: "added",
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        note: e.note,
      });
      continue;
    }
    if (was.sets === e.sets && sameReps(was.reps, e.reps)) {
      changes.push({
        kind: "unchanged",
        name: e.name,
        sets: e.sets,
        reps: e.reps,
      });
      continue;
    }
    changes.push({
      kind: "changed",
      name: e.name,
      from: { sets: was.sets, reps: was.reps },
      to: { sets: e.sets, reps: e.reps },
      note: e.note,
    });
  }

  // Dropped lifts are listed after the day's contents, because the question
  // "what am I losing?" only makes sense once you can see what you are getting.
  for (const e of before) {
    if (!afterIds.has(e.exerciseId)) {
      changes.push({
        kind: "removed",
        name: e.name,
        sets: e.sets,
        reps: e.reps,
      });
    }
  }

  return changes;
}

export function diffPrograms(
  before: DiffProgram | null,
  after: DiffProgram,
): ProgramDiff {
  // With nothing to compare against, every exercise is new. That is the honest
  // reading for a user who has no program yet.
  const beforeDays = before?.days ?? [];

  const days: DayChange[] = pairDays(beforeDays, after.days).map(([was, now]) => {
    if (!now) {
      return {
        name: was!.name,
        previousName: null,
        kind: "removed" as const,
        exercises: diffExercises(was!.exercises, []),
      };
    }
    if (!was) {
      return {
        name: now.name,
        previousName: null,
        kind: "added" as const,
        exercises: diffExercises([], now.exercises),
      };
    }

    const exercises = diffExercises(was.exercises, now.exercises);
    const renamed = was.name.trim() !== now.name.trim();
    const touched = exercises.some((c) => c.kind !== "unchanged");
    return {
      name: now.name,
      previousName: renamed ? was.name : null,
      kind: (touched || renamed ? "changed" : "unchanged") as
        | "changed"
        | "unchanged",
      exercises,
    };
  });

  const totals = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const day of days) {
    for (const change of day.exercises) {
      totals[change.kind] += 1;
    }
  }

  const nameChanged = (before?.name.trim() ?? "") !== after.name.trim();

  return {
    programName: {
      from: before?.name ?? "",
      to: after.name,
      changed: before !== null && nameChanged,
    },
    days,
    totals,
    identical:
      before !== null &&
      !nameChanged &&
      totals.added === 0 &&
      totals.removed === 0 &&
      totals.changed === 0 &&
      days.every((d) => d.previousName === null),
  };
}
