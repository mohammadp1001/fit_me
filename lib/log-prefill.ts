export type SetLog = { weight: string; reps: string };

export type SuggestionSet = { weight: number | null; reps: number | null };

/**
 * Decides what to pre-fill the per-set weight/reps inputs with when the log
 * form for a programExercise + today's date first opens.
 *
 * Priority:
 * 1. Today's WorkoutLog, if the user already saved one today - always wins,
 *    since it reflects what was actually entered/saved for today.
 * 2. Today's Suggestion, if one exists - per-set weight/reps from the coach.
 *    A set with no suggested reps falls back to the planned reps for that
 *    set index (same as the cold-start fallback below).
 * 3. Cold start: reps from ProgramExercise.reps, weight left blank - the
 *    existing pre-suggestion behavior, unchanged.
 */
export function computeInitialSets({
  setsCount,
  programReps,
  suggestionSets,
  todaysLogSets,
}: {
  setsCount: number;
  programReps: number[];
  suggestionSets: SuggestionSet[] | null | undefined;
  todaysLogSets: SetLog[] | null | undefined;
}): SetLog[] {
  if (todaysLogSets && todaysLogSets.length > 0) {
    return todaysLogSets;
  }

  return Array.from({ length: setsCount }, (_, i) => {
    const planned = programReps[i] ?? programReps[programReps.length - 1];
    const plannedStr = planned !== undefined ? String(planned) : "";
    const suggested = suggestionSets?.[i];

    if (suggested) {
      return {
        weight: suggested.weight != null ? String(suggested.weight) : "",
        reps: suggested.reps != null ? String(suggested.reps) : plannedStr,
      };
    }

    return { weight: "", reps: plannedStr };
  });
}
