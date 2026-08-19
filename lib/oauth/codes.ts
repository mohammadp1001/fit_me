import { prisma } from "@/lib/prisma";
import { hashSecret, randomSecret, verifyPkce } from "./crypto";
import { CODE_TTL_MS } from "./config";

/**
 * Authorization codes: issued only after the human clicks Allow, exchanged
 * exactly once, and dead 60 seconds later.
 */

export interface IssueCodeInput {
  clientId: string;
  /** The account that approved this at the consent screen. */
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource?: string;
}

/** Issues a code and returns the plaintext, which is never stored. */
export async function issueCode(
  input: IssueCodeInput,
  now: Date = new Date(),
): Promise<string> {
  const code = randomSecret();

  await prisma.oAuthCode.create({
    data: {
      codeHash: hashSecret(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope,
      resource: input.resource ?? null,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });

  return code;
}

export type ConsumeCodeResult =
  | { ok: true; scope: string; resource: string | null; userId: number }
  | { ok: false; error: "invalid_grant"; reason: string };

/**
 * Validates and burns an authorization code.
 *
 * The burn is done first, with a `consumedAt: null` guard inside the same
 * `updateMany`, so it is atomic: two concurrent exchanges of the same code
 * cannot both see it unconsumed and both succeed. Every later check runs
 * against the row that the winning update returned.
 *
 * All failures collapse to `invalid_grant` on the wire. `reason` exists for
 * tests and server logs, and must not be echoed to the client - distinguishing
 * "expired" from "wrong client" from "bad verifier" hands an attacker a probe.
 */
export async function consumeCode(
  code: string,
  {
    clientId,
    redirectUri,
    codeVerifier,
  }: { clientId: string; redirectUri: string; codeVerifier: string },
  now: Date = new Date(),
): Promise<ConsumeCodeResult> {
  const codeHash = hashSecret(code);

  const row = await prisma.oAuthCode.findUnique({ where: { codeHash } });
  if (!row) {
    return { ok: false, error: "invalid_grant", reason: "unknown code" };
  }

  // Atomic single-use burn. A replay loses this race and gets count === 0.
  const burned = await prisma.oAuthCode.updateMany({
    where: { codeHash, consumedAt: null },
    data: { consumedAt: now },
  });
  if (burned.count === 0) {
    return { ok: false, error: "invalid_grant", reason: "code already used" };
  }

  if (row.expiresAt <= now) {
    return { ok: false, error: "invalid_grant", reason: "code expired" };
  }

  if (row.clientId !== clientId) {
    return { ok: false, error: "invalid_grant", reason: "client mismatch" };
  }

  if (row.redirectUri !== redirectUri) {
    return { ok: false, error: "invalid_grant", reason: "redirect_uri mismatch" };
  }

  if (!verifyPkce(row.codeChallenge, row.codeChallengeMethod, codeVerifier)) {
    return { ok: false, error: "invalid_grant", reason: "PKCE verification failed" };
  }

  return { ok: true, scope: row.scope, resource: row.resource, userId: row.userId };
}

/** Deletes codes past their expiry. Called by the cleanup cron. */
export async function pruneCodes(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.oAuthCode.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}
