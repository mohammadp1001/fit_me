import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/session";
import { redeemInvite } from "@/lib/db/accounts";
import { checkPasswordStrength, checkUsername } from "@/lib/auth/password";
import { clientIp, consumeRateLimit } from "@/lib/oauth/rate-limit";

const schema = z.object({
  token: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1).max(80),
});

/** Guessing a 192-bit token is infeasible; there is still no reason to allow trying. */
const SIGNUP_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rate = await consumeRateLimit("signup", clientIp(request), SIGNUP_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const username = checkUsername(parsed.data.username);
  if (!username.ok) {
    return NextResponse.json({ error: username.reason }, { status: 400 });
  }

  const password = checkPasswordStrength(parsed.data.password);
  if (!password.ok) {
    return NextResponse.json({ error: password.reason }, { status: 400 });
  }

  const result = await redeemInvite(parsed.data.token, {
    username: username.value,
    password: parsed.data.password,
    name: parsed.data.name,
  });

  if (!result.ok) {
    if (result.reason === "username-taken") {
      return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "This invite link is not valid any more." },
      { status: 400 }
    );
  }

  await signIn(result.userId);

  return NextResponse.json({ ok: true });
}
