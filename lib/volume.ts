import { Muscle } from "@prisma/client";
import {
  MUSCLE_GROUP,
  MUSCLE_GROUPS,
  MuscleGroup,
  PRIMARY_SET_WEIGHT,
  SECONDARY_SET_WEIGHT,
} from "./muscles";

/** Trailing window, in days, that volume is aggregated over (inclusive of today). */
export const VOLUME_WINDOW_DAYS = 7;

/** A single logged set as stored in `WorkoutLog.sets` (JSON, both fields nullable). */
export interface LoggedSet {
  weight: number | null;
  reps: number | null;
}

export interface VolumeEntry {
  date: Date | string;
  sets: LoggedSet[];
  musclesPrimary: Muscle[];
  musclesSecondary: Muscle[];
}

/**
 * A set counts as "hard" iff it records reps actually performed.
 *
 * `weight` is deliberately ignored: bodyweight work (Push Up, Dip) logs a null
 * weight, so any tonnage-based rule would silently count it as zero. Blank
 * placeholder rows - saved when a user fills in only some of the sets - carry a
 * null `reps` and must not inflate the count.
 */
export function countHardSets(sets: LoggedSet[]): number {
  return sets.filter((s) => s.reps !== null && s.reps > 0).length;
}

function utcDayIndex(value: Date | string): number {
  const date = typeof value === "string" ? new Date(value) : value;
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

export function isWithinWindow(
  date: Date | string,
  now: Date | string = new Date(),
  windowDays: number = VOLUME_WINDOW_DAYS
): boolean {
  const age = utcDayIndex(now) - utcDayIndex(date);
  return age >= 0 && age < windowDays;
}

function emptyTotals(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<
    MuscleGroup,
    number
  >;
}

/**
 * Hard sets per muscle group over the trailing window.
 *
 * A set contributes to a *group* once, at the highest role weight any of that
 * group's muscles holds for the exercise. Summing per muscle instead would let
 * one Lat Pulldown set count twice toward `back` merely because both `lats` and
 * `rhomboids` are listed as primary, which inflates volume purely as a function
 * of how finely an exercise happens to be tagged.
 */
export function volumeByGroup(
  entries: VolumeEntry[],
  now: Date | string = new Date(),
  windowDays: number = VOLUME_WINDOW_DAYS
): Record<MuscleGroup, number> {
  const totals = emptyTotals();

  for (const entry of entries) {
    if (!isWithinWindow(entry.date, now, windowDays)) continue;

    const hardSets = countHardSets(entry.sets);
    if (hardSets === 0) continue;

    const weightByGroup = new Map<MuscleGroup, number>();
    const apply = (muscles: Muscle[], weight: number) => {
      for (const muscle of muscles) {
        const group = MUSCLE_GROUP[muscle];
        weightByGroup.set(group, Math.max(weightByGroup.get(group) ?? 0, weight));
      }
    };

    apply(entry.musclesSecondary, SECONDARY_SET_WEIGHT);
    apply(entry.musclesPrimary, PRIMARY_SET_WEIGHT);

    for (const [group, weight] of weightByGroup) {
      totals[group] += hardSets * weight;
    }
  }

  return totals;
}

/** The groups an exercise touches, ordered by role then by the canonical group order. */
export function groupsForExercise(
  musclesPrimary: Muscle[],
  musclesSecondary: Muscle[]
): MuscleGroup[] {
  const seen = new Set<MuscleGroup>();
  for (const muscle of [...musclesPrimary, ...musclesSecondary]) {
    seen.add(MUSCLE_GROUP[muscle]);
  }
  return MUSCLE_GROUPS.filter((g) => seen.has(g));
}
