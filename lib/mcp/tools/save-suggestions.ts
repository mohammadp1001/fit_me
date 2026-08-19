import { resolveExerciseStrict, type ExerciseRef } from "@/lib/db/exercises";
import { appendNote } from "@/lib/coach-notes";
import { findActiveSlotFor } from "@/lib/db/programs";
import { hasLogOn } from "@/lib/db/logs";
import { upsertSuggestion } from "@/lib/db/suggestions";
import {
  getExerciseMemory,
  getGlobalMemory,
  setExerciseMemory,
  setGlobalMemory,
} from "@/lib/db/memory";

/**
 * `save_suggestions` - the only tool in the FitMe MCP server that writes.
 *
 * The MCP client asks the user to approve each tool call, and that prompt is
 * the intended approval screen. But "always allow" removes it silently, so
 * every guard below is enforced here as well. None of them may be relaxed on
 * the grounds that the client asks first: the client will stop asking.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SuggestionRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestionRejected";
  }
}

export interface SuggestedSetInput {
  weightKg: number | null;
  reps: number;
}

export interface SuggestionItemInput {
  exercise: string;
  sets: SuggestedSetInput[];
  why: string;
}

export interface SaveSuggestionsInput {
  /** The account this grant acts as, from the verified OAuth token. */
  userId: number;
  date: string;
  items: SuggestionItemInput[];
  exerciseNotes?: Array<{ exercise: string; note: string }>;
  globalNote?: string;
  /** Injected in tests; defaults to the real clock. */
  now?: Date;
}

/** Today as a day-only Date, matching the `@db.Date` columns. */
function todayDateOnly(now: Date): Date {
  return new Date(now.toISOString().slice(0, 10));
}

/**
 * Locates the active program's slot for an exercise.
 *
 * `Suggestion.programExerciseId` is required and the log screen queries by it,
 * so a suggestion for an exercise that is not in the active program has nowhere
 * to appear. Refusing is better than writing a row the user will never see.
 *
 * When a program lists the same exercise twice, the lowest `displayOrder` wins
 * - deterministic, and it matches the order the day is performed in.
 */
async function findActiveSlot(userId: number, exercise: ExerciseRef) {
  const slot = await findActiveSlotFor(userId, exercise.id);

  if (!slot) {
    throw new SuggestionRejected(
      `"${exercise.nameEn}" is not in the active program, so a suggestion for ` +
        `it would never be shown. Call get_program to see what is scheduled.`,
    );
  }

  return slot;
}

export interface SaveSuggestionsResult {
  date: string;
  saved: Array<{ nameFa: string; nameEn: string; sets: number }>;
  exerciseNotesUpdated: string[];
  globalNoteUpdated: boolean;
}

export async function saveSuggestions({
  userId,
  date,
  items,
  exerciseNotes = [],
  globalNote,
  now = new Date(),
}: SaveSuggestionsInput): Promise<SaveSuggestionsResult> {
  if (!DATE_RE.test(date)) {
    throw new SuggestionRejected("date must be in YYYY-MM-DD form.");
  }

  const target = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) {
    throw new SuggestionRejected(`"${date}" is not a real date.`);
  }

  // Guard 1: never write into the past. A suggestion for a day that has already
  // happened cannot be acted on, and would quietly rewrite the record of what
  // was planned.
  const today = todayDateOnly(now);
  if (target < today) {
    throw new SuggestionRejected(
      `${date} is in the past. Suggestions can only be saved for today or later.`,
    );
  }

  if (items.length === 0) {
    throw new SuggestionRejected("items must contain at least one exercise.");
  }

  // Resolve and validate everything before writing anything, so a bad item
  // cannot leave half a day's suggestions saved.
  const prepared = [];
  for (const item of items) {
    if (item.sets.length === 0) {
      throw new SuggestionRejected(
        `"${item.exercise}" has no sets. Every item needs at least one set.`,
      );
    }
    for (const set of item.sets) {
      if (!Number.isInteger(set.reps) || set.reps <= 0) {
        throw new SuggestionRejected(
          `"${item.exercise}" has a set with reps=${set.reps}. Reps must be a positive integer.`,
        );
      }
      if (set.weightKg !== null && (!Number.isFinite(set.weightKg) || set.weightKg < 0)) {
        throw new SuggestionRejected(
          `"${item.exercise}" has a set with weightKg=${set.weightKg}. Use null for bodyweight, otherwise a non-negative number.`,
        );
      }
    }
    if (!item.why.trim()) {
      throw new SuggestionRejected(
        `"${item.exercise}" has no rationale. Explain why these numbers, so the user can judge them.`,
      );
    }

    const exercise = await resolveExerciseStrict(userId, item.exercise);

    // Guard 2: never overwrite a day that has already been trained. Once sets
    // are logged, the suggestion is history - replacing it would rewrite what
    // the user was told at the time.
    const logged = await hasLogOn(userId, exercise.id, target);
    if (logged) {
      throw new SuggestionRejected(
        `"${exercise.nameEn}" was already logged on ${date}. ` +
          `A suggestion for a session that has happened cannot be changed.`,
      );
    }

    const slot = await findActiveSlot(userId, exercise);
    prepared.push({ item, exercise, slot });
  }

  const noteDate = now.toISOString().slice(0, 10);
  const saved: SaveSuggestionsResult["saved"] = [];

  for (const { item, exercise, slot } of prepared) {
    // Stored as `{ weight, reps }` because that is what `lib/log-prefill.ts`
    // reads to pre-fill the log form. Renaming it here would silently stop the
    // suggestion appearing at the gym.
    const sets = item.sets.map((s) => ({ weight: s.weightKg, reps: s.reps }));

    await upsertSuggestion(userId, {
      exerciseId: exercise.id,
      programExerciseId: slot.id,
      date: target,
      sets,
      rationale: item.why.trim(),
    });

    saved.push({
      nameFa: exercise.nameFa,
      nameEn: exercise.nameEn,
      sets: sets.length,
    });
  }

  const exerciseNotesUpdated: string[] = [];
  for (const { exercise: name, note } of exerciseNotes) {
    if (!note.trim()) continue;

    const exercise = await resolveExerciseStrict(userId, name);
    const existing = await getExerciseMemory(exercise.id);

    // Append, never replace - see lib/coach-notes.ts.
    const notes = appendNote(existing?.notes, note, noteDate);
    await setExerciseMemory(exercise.id, notes);

    exerciseNotesUpdated.push(exercise.nameEn);
  }

  let globalNoteUpdated = false;
  if (globalNote?.trim()) {
    const existing = await getGlobalMemory(userId);
    const notes = appendNote(existing?.notes, globalNote, noteDate);
    await setGlobalMemory(userId, notes);
    globalNoteUpdated = true;
  }

  return {
    date,
    saved,
    exerciseNotesUpdated,
    globalNoteUpdated,
  };
}
