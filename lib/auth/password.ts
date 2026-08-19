import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * `bcryptjs` rather than the native `bcrypt` binding: native bcrypt needs a
 * compile step at install time, which is exactly the kind of thing that works
 * locally and breaks a Vercel build.
 *
 * Note the contrast with `lib/oauth/crypto.ts`, which hashes tokens with a
 * bare SHA-256. That is not an inconsistency: tokens are 256-bit random
 * strings with no dictionary to attack, so stretching buys nothing and would
 * cost a slow hash on every MCP request. Passwords are human-chosen and need
 * the work factor.
 */

/**
 * Cost factor. 12 is roughly 250ms on the kind of CPU Vercel gives a function -
 * slow enough to make offline cracking expensive, fast enough that a login does
 * not feel broken. Raise it as hardware improves; existing hashes carry their
 * own cost and keep verifying.
 */
const ROUNDS = 12;

/** Minimum password length. Short enough not to annoy, long enough to matter. */
export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

/**
 * Verifies a password against a stored hash.
 *
 * A null hash - an account that exists but has never been claimed - always
 * fails, and does so *after* a dummy comparison so the timing does not reveal
 * which accounts have credentials.
 */
export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) {
    // Burn the same work an actual comparison would, so "no such user" and
    // "wrong password" take the same time. Without this, response timing
    // enumerates which usernames exist.
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * A real bcrypt hash of a value nobody can guess, used only to spend time on
 * the failure path. Generated once at module load rather than hardcoded, so it
 * is never a known-plaintext target.
 */
const DUMMY_HASH = bcrypt.hashSync(
  Math.random().toString(36) + Date.now().toString(36),
  ROUNDS,
);

export interface PasswordProblem {
  ok: false;
  reason: string;
}

/**
 * Password rules, deliberately minimal: length only.
 *
 * Composition rules (a digit, a symbol, mixed case) push people toward
 * `Password1!` and measurably do not help. Length is the property that does.
 */
export function checkPasswordStrength(
  password: string,
): { ok: true } | PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true };
}

/** Usernames are stored and compared lowercased, so casing never splits an account. */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function checkUsername(
  username: string,
): { ok: true; value: string } | PasswordProblem {
  const value = normaliseUsername(username);

  if (value.length < 3 || value.length > 30) {
    return { ok: false, reason: "Username must be 3 to 30 characters." };
  }
  // Letters, digits, underscore, hyphen. Keeps usernames unambiguous in URLs
  // and log lines, and sidesteps homoglyph lookalikes entirely.
  if (!/^[a-z0-9_-]+$/.test(value)) {
    return {
      ok: false,
      reason: "Username may only contain letters, numbers, underscore and hyphen.",
    };
  }
  return { ok: true, value };
}
