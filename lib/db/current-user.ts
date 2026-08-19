import { sessionUserId } from "@/lib/session";

/**
 * Who the current request belongs to.
 *
 * Reads the session cookie. Throws rather than returning a default when there
 * is none: a query that silently falls back to "account 1" would serve one
 * user's data to an anonymous caller, and that is precisely the failure this
 * whole layer exists to make impossible.
 *
 * Route handlers still check `isAuthenticated()` first and answer 401, so this
 * throwing is a backstop for a forgotten check, not the primary path.
 */
export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotSignedInError";
  }
}

export async function currentUserId(): Promise<number> {
  const userId = await sessionUserId();
  if (userId === null) {
    throw new NotSignedInError();
  }
  return userId;
}
