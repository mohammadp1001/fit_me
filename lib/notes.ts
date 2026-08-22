/**
 * The user's note to their coach, written per exercise per session.
 *
 * Numbers cannot say "last two sets were grindy" or "grip gave out before my
 * back did", and those are exactly the observations that should change the next
 * prescription. The note is what turns a log into something a coach can read.
 */

/**
 * Long enough for anything worth telling a coach, short enough that the field
 * cannot become free storage.
 *
 * Shared by the API and the input, so the server's rule and the client's
 * counter cannot drift apart - the counter is a courtesy, the server is the
 * rule.
 */
export const NOTE_MAX_LENGTH = 1000;
