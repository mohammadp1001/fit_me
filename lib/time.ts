/**
 * Timezone handling.
 *
 * The app used to have none: the client computed today's date from the phone's
 * clock and posted it as a bare `YYYY-MM-DD` string, and the server stored it
 * without ever learning where the user was. That works only for as long as
 * nothing has a time of day on it.
 *
 * Once instants are stored, the server has to answer "which local calendar day
 * did this happen on?", and it cannot do that from a UTC instant alone. A
 * workout logged at 9pm in Tehran is 17:30Z; read back in UTC it is an
 * afternoon session on, near midnight, the wrong day entirely.
 *
 * So: instants are stored as UTC, and the user's IANA timezone converts them
 * for display and for day-bucketing. An IANA name rather than a fixed offset,
 * because the app needs the *rule* - an offset is wrong for half the year
 * anywhere that observes DST.
 */

export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Whether the runtime can resolve this timezone name.
 *
 * Deliberately asks the platform instead of pattern-matching the string: the
 * IANA database changes, and the only answer that matters is whether *this*
 * Node can format a date in it.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  // Modern runtimes accept offset zones like `+03:30`, and they are exactly
  // what this column must not hold: an offset is a snapshot of a rule, correct
  // until the zone next shifts. Reject them even though `Intl` would not.
  if (/^[+-]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A usable timezone, falling back to UTC.
 *
 * Called on the way in from anything a client sent. A bad value must not throw
 * on every later read - a wrong-but-working timezone degrades gracefully, an
 * exception in a formatter does not.
 */
export function normalizeTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone === "string" && isValidTimeZone(timeZone)) return timeZone;
  return DEFAULT_TIME_ZONE;
}

/**
 * The local calendar day an instant falls on, as `YYYY-MM-DD`.
 *
 * This is the bucketing rule for everything date-shaped: which day a session
 * belongs to, which day a log is filed under. `en-CA` is used because its
 * short date format is already ISO order; the alternative is reassembling
 * `formatToParts` by hand for no gain.
 */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Local wall-clock time as `HH:MM`, 24-hour. */
export function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: normalizeTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/** Local day and time together, e.g. `2026-08-21 21:04`. */
export function localDayTime(instant: Date, timeZone: string): string {
  return `${localDay(instant, timeZone)} ${localTime(instant, timeZone)}`;
}
