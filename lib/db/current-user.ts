/**
 * Who the current request belongs to.
 *
 * FitMe is still single-user: this returns `1`, the id every row already
 * carries. It exists so that the ~30 call sites which used to hardcode `1`
 * now go through one function, and the switch to real accounts (#60) is a
 * change to this file rather than a hunt through route handlers.
 *
 * Deliberately async even though it does nothing yet - #60 reads the session,
 * which is async, and making callers `await` now means that change does not
 * ripple back out through every caller.
 */

/** The single account every existing row belongs to. Removed in #60. */
export const SINGLE_USER_ID = 1;

/**
 * The id to scope this request's queries by.
 *
 * In #60 this becomes "read the session, throw if there is none". Until then
 * every request is the same person.
 */
export async function currentUserId(): Promise<number> {
  return SINGLE_USER_ID;
}
