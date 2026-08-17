/**
 * @jest-environment node
 */
import {
  appendNote,
  formatNote,
  MAX_NOTE_ENTRIES,
  parseNote,
} from "./coach-notes";

describe("appendNote", () => {
  it("dates a note appended to an empty record", () => {
    expect(appendNote(null, "Responds to a deload.", "2026-08-17")).toBe(
      "[2026-08-17] Responds to a deload.",
    );
  });

  it("keeps earlier notes rather than replacing them", () => {
    // The whole reason this is append-only: a model writes these on the user's
    // behalf and can be wrong. Overwriting would erase the record silently.
    const first = appendNote(null, "Stalls at 100kg.", "2026-08-01");
    const second = appendNote(first, "Deload worked.", "2026-08-17");

    expect(second).toBe(
      "[2026-08-01] Stalls at 100kg.\n[2026-08-17] Deload worked.",
    );
  });

  it("ignores an empty note instead of padding the record", () => {
    const existing = "[2026-08-01] Real note.";

    expect(appendNote(existing, "   ", "2026-08-17")).toBe(existing);
    expect(appendNote(existing, "", "2026-08-17")).toBe(existing);
  });

  it("preserves undated legacy text as its own entry", () => {
    // The retired mock cron wrote bare strings. Losing them to a format change
    // would be exactly the silent data loss appending exists to prevent.
    const legacy = "Mock exercise memory update.";

    const result = appendNote(legacy, "Real observation.", "2026-08-17");

    expect(result).toContain("Mock exercise memory update.");
    expect(result).toContain("[2026-08-17] Real observation.");
  });

  it("drops the oldest entries once the cap is reached", () => {
    let notes: string | null = null;
    for (let i = 1; i <= MAX_NOTE_ENTRIES + 5; i++) {
      notes = appendNote(notes, `note ${i}`, "2026-08-17");
    }

    const entries = parseNote(notes);
    expect(entries).toHaveLength(MAX_NOTE_ENTRIES);
    // Oldest gone, newest kept.
    expect(notes).not.toContain("note 1 ");
    expect(notes).toContain(`note ${MAX_NOTE_ENTRIES + 5}`);
  });

  it("survives a multi-line note", () => {
    const withNewlines = appendNote(null, "line one\nline two", "2026-08-17");
    const entries = parseNote(withNewlines);

    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("line one\nline two");
  });

  it("round-trips through parse and format", () => {
    const notes = appendNote(
      appendNote(null, "first", "2026-08-01"),
      "second",
      "2026-08-17",
    );

    expect(formatNote(parseNote(notes))).toBe(notes);
  });
});
