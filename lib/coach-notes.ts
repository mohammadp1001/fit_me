/**
 * Append-only coach notes.
 *
 * The coach's memory is written by a language model on the user's behalf, and
 * a model can be wrong about someone. Blind overwrite would let one bad
 * inference silently replace everything learned before it, with no way to see
 * what changed or when. Appending with a date keeps the history legible and
 * makes a wrong note obvious rather than authoritative.
 *
 * Kept pure so the format is pinned by unit tests rather than by whatever the
 * database happens to contain.
 */

/**
 * How many dated entries a note keeps.
 *
 * Bounded because these strings are fed back into a prompt: unbounded growth
 * would quietly inflate every future coaching conversation. Twenty entries is
 * roughly half a year of weekly notes, and the oldest are the least useful.
 */
export const MAX_NOTE_ENTRIES = 20;

const ENTRY_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s([\s\S]*)$/;

export interface NoteEntry {
  date: string;
  text: string;
}

/**
 * Splits a stored note into dated entries.
 *
 * Text that predates this format (the mock cron wrote bare strings) has no
 * date, so it is preserved as a single undated entry rather than discarded -
 * losing prior notes to a format change would be exactly the silent data loss
 * appending exists to prevent.
 */
export function parseNote(existing: string | null | undefined): NoteEntry[] {
  if (!existing || !existing.trim()) {
    return [];
  }

  const lines = existing.split("\n");
  const entries: NoteEntry[] = [];
  let current: NoteEntry | null = null;

  for (const line of lines) {
    const match = line.match(ENTRY_RE);
    if (match) {
      if (current) entries.push(current);
      current = { date: match[1], text: match[2].trim() };
    } else if (current) {
      // Continuation of a multi-line entry.
      current.text = `${current.text}\n${line}`.trim();
    } else if (line.trim()) {
      current = { date: "", text: line.trim() };
    }
  }
  if (current) entries.push(current);

  return entries;
}

/** Renders entries back to the stored form. */
export function formatNote(entries: NoteEntry[]): string {
  return entries
    .map((e) => (e.date ? `[${e.date}] ${e.text}` : e.text))
    .join("\n");
}

/**
 * Appends a dated note, dropping the oldest entries past the cap.
 *
 * An empty or whitespace-only note is a no-op: a model that has nothing new to
 * say should not be able to pad the record with blanks.
 */
export function appendNote(
  existing: string | null | undefined,
  note: string,
  date: string,
  maxEntries: number = MAX_NOTE_ENTRIES,
): string {
  const trimmed = note.trim();
  if (!trimmed) {
    return existing ?? "";
  }

  const entries = [...parseNote(existing), { date, text: trimmed }];
  return formatNote(entries.slice(-maxEntries));
}
