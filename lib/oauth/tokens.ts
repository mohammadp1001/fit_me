import { prisma } from "@/lib/prisma";
import { hashSecret, randomSecret } from "./crypto";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./config";

/**
 * Access and refresh tokens.
 *
 * Both are opaque random strings stored only as SHA-256. A JWT would let the
 * MCP endpoint verify without a database round trip, but it would also make
 * revocation impossible before expiry, and this server has a database in the
 * request path regardless - every tool call reads Postgres anyway.
 */

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export async function issueTokens(
  {
    clientId,
    scope,
    resource,
  }: { clientId: string; scope: string; resource?: string | null },
  now: Date = new Date(),
): Promise<IssuedTokens> {
  const accessToken = randomSecret();
  const refreshToken = randomSecret();

  await prisma.oAuthToken.create({
    data: {
      accessTokenHash: hashSecret(accessToken),
      refreshTokenHash: hashSecret(refreshToken),
      clientId,
      scope,
      resource: resource ?? null,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope,
  };
}

export type RefreshResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: string };

/**
 * Rotates a refresh token.
 *
 * OAuth 2.1 requires rotation for public clients: the presented refresh token
 * is revoked and a fresh pair issued. Reuse of an already-rotated token is
 * therefore detectable, and is treated as theft - the whole grant is revoked
 * rather than merely refused, because a legitimate client never replays one.
 */
export async function refreshTokens(
  refreshToken: string,
  clientId: string,
  now: Date = new Date(),
): Promise<RefreshResult> {
  const refreshTokenHash = hashSecret(refreshToken);
  const row = await prisma.oAuthToken.findUnique({ where: { refreshTokenHash } });

  if (!row) {
    return { ok: false, reason: "unknown refresh token" };
  }
  if (row.clientId !== clientId) {
    return { ok: false, reason: "client mismatch" };
  }
  if (row.revokedAt) {
    return { ok: false, reason: "grant revoked" };
  }
  if (row.refreshExpiresAt && row.refreshExpiresAt <= now) {
    return { ok: false, reason: "refresh token expired" };
  }

  // Burn the old pair atomically; a concurrent replay loses this race.
  const revoked = await prisma.oAuthToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: now, refreshTokenHash: null },
  });
  if (revoked.count === 0) {
    return { ok: false, reason: "refresh token already rotated" };
  }

  const tokens = await issueTokens(
    { clientId: row.clientId, scope: row.scope, resource: row.resource },
    now,
  );
  return { ok: true, tokens };
}

export interface VerifiedToken {
  clientId: string;
  scopes: string[];
  resource: string | null;
}

/**
 * Verifies a bearer access token.
 *
 * Returns null for anything not currently valid - unknown, expired or revoked -
 * so the caller has a single 401 path and cannot accidentally leak which.
 */
export async function verifyAccessToken(
  token: string,
  now: Date = new Date(),
): Promise<VerifiedToken | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { accessTokenHash: hashSecret(token) },
  });

  if (!row || row.revokedAt || row.expiresAt <= now) {
    return null;
  }

  return {
    clientId: row.clientId,
    scopes: row.scope.split(/\s+/).filter(Boolean),
    resource: row.resource,
  };
}

/**
 * Deletes tokens whose access *and* refresh lifetimes have both lapsed.
 *
 * A row is kept while its refresh token could still be presented, even though
 * the access token inside it expired an hour in - dropping it early would turn
 * a valid refresh into an unexplained failure.
 */
export async function pruneTokens(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.oAuthToken.deleteMany({
    where: {
      expiresAt: { lt: now },
      OR: [{ refreshExpiresAt: null }, { refreshExpiresAt: { lt: now } }],
    },
  });
  return count;
}
