import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Secret handling for the OAuth provider.
 *
 * Nothing bearer-shaped is ever stored in plaintext. Codes, access tokens,
 * refresh tokens and client secrets are all persisted as SHA-256 digests, so a
 * database leak yields nothing that can be replayed against this server.
 *
 * SHA-256 rather than a password hash (bcrypt/argon2) is deliberate: these are
 * 256-bit random strings, not human-chosen passwords. There is no dictionary to
 * attack, so the stretching would buy nothing and would cost a slow hash on
 * every single MCP request.
 */

/** A URL-safe, 256-bit random secret. */
export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Stable digest used as the stored form of every bearer-shaped secret. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Digest comparison is only reachable by callers who already produced a
 * matching lookup, but comparing with `===` would still leak a timing signal on
 * the client-secret path, where the attacker controls the candidate.
 */
export function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies an RFC 7636 PKCE challenge.
 *
 * Only S256 is accepted. The `plain` method is permitted by RFC 7636 but
 * forbidden by OAuth 2.1 for exactly the reason it matters here: with `plain`
 * the verifier travels in the authorization request, so anyone who can observe
 * the redirect can complete the exchange.
 */
export function verifyPkce(
  codeChallenge: string,
  codeChallengeMethod: string,
  codeVerifier: string,
): boolean {
  if (codeChallengeMethod !== "S256") {
    return false;
  }

  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const expected = Buffer.from(codeChallenge);
  const actual = Buffer.from(computed);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
