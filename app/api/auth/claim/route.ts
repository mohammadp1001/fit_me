import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/session";
import { claimLegacyAccount, unclaimedAccountExists } from "@/lib/db/accounts";
import { checkPasswordStrength, checkUsername } from "@/lib/auth/password";
import { clientIp, consumeRateLimit } from "@/lib/oauth/rate-limit";

const schema = z.object({
  passphrase: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const CLAIM_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * The one-time bridge from the shared passphrase to real accounts.
 *
 * The account that predates accounts has a full training history and no
 * credentials. Whoever knows the old passphrase attaches a username and
 * password to it here, once, and becomes the admin.
 *
 * Deliberately self-disabling: once no account is missing credentials it
 * answers 410 forever, so leaving it routed is harmless. Delete it in a
 * follow-up once it has been used.
 */
export async function POST(request: NextRequest) {
  if (!(await unclaimedAccountExists())) {
    return NextResponse.json(
      { error: "There is no unclaimed account. Sign in normally." },
      { status: 410 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rate = await consumeRateLimit("claim", clientIp(request), CLAIM_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const expected = process.env.APP_PASSPHRASE;
  if (!expected || parsed.data.passphrase !== expected) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  const username = checkUsername(parsed.data.username);
  if (!username.ok) {
    return NextResponse.json({ error: username.reason }, { status: 400 });
  }

  const password = checkPasswordStrength(parsed.data.password);
  if (!password.ok) {
    return NextResponse.json({ error: password.reason }, { status: 400 });
  }

  const result = await claimLegacyAccount({
    username: username.value,
    password: parsed.data.password,
  });

  if (!result.ok) {
    if (result.reason === "username-taken") {
      return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "There is no unclaimed account." },
      { status: 410 }
    );
  }

  await signIn(result.userId);

  return NextResponse.json({ ok: true });
}

/** Lets the claim page decide whether to render at all. */
export async function GET() {
  return NextResponse.json({ available: await unclaimedAccountExists() });
}
