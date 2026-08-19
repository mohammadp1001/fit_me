import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/session";
import { authenticate } from "@/lib/db/accounts";
import { normaliseUsername } from "@/lib/auth/password";
import { clientIp, consumeRateLimit } from "@/lib/oauth/rate-limit";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Rate limit on a public login form.
 *
 * Reuses the Postgres-backed limiter built for OAuth registration in #52 -
 * serverless shares no memory, so an in-process counter would reset on every
 * cold start and limit nothing.
 *
 * Keyed on IP *and* username. IP alone lets a botnet spread attempts across
 * hosts; username alone lets an attacker lock a specific person out of their
 * own account. Both together bound each without handing anyone that lever.
 */
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = normaliseUsername(parsed.data.username);

  const byIp = await consumeRateLimit("login-ip", clientIp(request), LOGIN_RATE_LIMIT);
  const byUser = await consumeRateLimit("login-user", username, LOGIN_RATE_LIMIT);
  if (!byIp.allowed || !byUser.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const userId = await authenticate(username, parsed.data.password);
  if (userId === null) {
    // One message for every failure - unknown user, wrong password, unclaimed
    // account. Distinguishing them turns the form into a username oracle.
    return NextResponse.json(
      { error: "Incorrect username or password" },
      { status: 401 }
    );
  }

  await signIn(userId);

  return NextResponse.json({ ok: true });
}
