/**
 * Workout sessions: which logs belong to the same workout.
 *
 * There is no start or finish button anywhere in the app, on purpose. A
 * boundary the user has to remember is a boundary they will forget, and a
 * forgotten Finish leaves worse data than no button at all - a session that
 * never closed. A derived boundary cannot be forgotten.
 *
 * The rule is a gap: a log joins the most recent session if that session's last
 * activity is under `SESSION_GAP_MS` away, and otherwise opens a new one. That
 * makes a morning leg workout and an evening arm workout two sessions with no
 * input from the user, while a long rest between exercises keeps one workout
 * whole.
 */

/**
 * How far apart two logged exercises can be and still count as one workout.
 *
 * Four hours is long enough to cover a slow session, a phone call, or a shower
 * before remembering to log the last lift, and short enough that a morning and
 * an evening workout never merge.
 */
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

/**
 * Whether a log made at `at` belongs to a session whose last activity was
 * `lastActivity`.
 *
 * Measured as an absolute distance. In practice `at` is always now and is
 * therefore at or after the session's end, but clock skew between a phone and
 * the server can produce the reverse, and a log a few seconds "before" the
 * session it plainly belongs to must not open a second one.
 *
 * The boundary is exclusive: exactly `SESSION_GAP_MS` apart is a new session.
 */
export function joinsSession(lastActivity: Date, at: Date): boolean {
  return Math.abs(at.getTime() - lastActivity.getTime()) < SESSION_GAP_MS;
}
