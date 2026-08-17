import { NextRequest, NextResponse } from "next/server";
import { pruneUnusedClients } from "@/lib/oauth/clients";
import { pruneCodes } from "@/lib/oauth/codes";
import { pruneTokens } from "@/lib/oauth/tokens";
import { pruneRateLimits } from "@/lib/oauth/rate-limit";

export interface OAuthCleanupResult {
  codes: number;
  tokens: number;
  clients: number;
  rateLimits: number;
}

/**
 * Sweeps expired OAuth rows.
 *
 * This is the half of the open-registration bargain that makes it safe: anyone
 * may register a client, and anything that never gets used is deleted. Without
 * a scheduled sweep, `/api/oauth/register` is an unbounded write to the
 * database by any caller on the internet.
 *
 * Order matters. Codes and tokens are deleted before clients so their rows go
 * on their own terms; the foreign keys cascade, so a client deleted first would
 * take live grants with it.
 */
export async function runOAuthCleanup(
  now: Date = new Date(),
): Promise<OAuthCleanupResult> {
  const codes = await pruneCodes(now);
  const tokens = await pruneTokens(now);
  const clients = await pruneUnusedClients(now);
  const rateLimits = await pruneRateLimits(now);

  return { codes, tokens, clients, rateLimits };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await runOAuthCleanup());
}
