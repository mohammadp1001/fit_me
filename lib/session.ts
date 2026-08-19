import { getIronSession, IronSessionData } from "iron-session";
import { cookies } from "next/headers";

/**
 * The session cookie.
 *
 * It used to carry a bare `authenticated: true` - there was one account, so
 * knowing *that* someone was logged in was the same as knowing *who*. With
 * accounts (#60) it carries the account id, and that id is what every query
 * scopes by.
 *
 * `userId` is optional in the type only because iron-session hands back an
 * empty object for a missing or invalid cookie. Treat "no userId" as logged
 * out; never fall back to a default account.
 */
declare module "iron-session" {
  interface IronSessionData {
    userId?: number;
  }
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "fitme_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    // `lax` is load-bearing beyond CSRF on normal forms: it is what stops a
    // cross-site POST from reaching the OAuth consent screen with a valid
    // session attached. See app/api/oauth/authorize/route.ts.
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<IronSessionData>(cookieStore, sessionOptions);
}

/** The signed-in account id, or null. */
export async function sessionUserId(): Promise<number | null> {
  const session = await getSession();
  return session.userId ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await sessionUserId()) !== null;
}

/** Starts a session for `userId`, replacing any existing one. */
export async function signIn(userId: number): Promise<void> {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
