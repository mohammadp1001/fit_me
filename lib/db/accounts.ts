import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { seedExerciseLibrary } from "./exercise-template";

/**
 * Accounts and invites.
 *
 * Signup is invite-only: there is no public registration page, so the only way
 * into the app is a single-use link an admin generated and sent out of band.
 * That is what keeps a public URL from attracting bots without needing email
 * verification, a captcha, or an email provider at all.
 */

/** Invites are short-lived - a link that leaks a month later should be dead. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The plaintext invite token is shown once and never stored. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// --- invites ----------------------------------------------------------------

export interface CreatedInvite {
  /** Shown to the admin once. Never recoverable afterwards. */
  token: string;
  expiresAt: Date;
  label: string;
}

export async function createInvite(
  createdById: number,
  { label = "", now = new Date() }: { label?: string; now?: Date } = {},
): Promise<CreatedInvite> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

  await prisma.invite.create({
    data: { tokenHash: hashToken(token), label, createdById, expiresAt },
  });

  return { token, expiresAt, label };
}

export type InviteState =
  | { ok: true; id: number }
  | { ok: false; reason: "unknown" | "redeemed" | "expired" };

/**
 * Checks an invite without consuming it, so `/join` can show a useful page
 * before asking for a username.
 */
export async function checkInvite(
  token: string,
  now: Date = new Date(),
): Promise<InviteState> {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.redeemedAt) return { ok: false, reason: "redeemed" };
  if (invite.expiresAt <= now) return { ok: false, reason: "expired" };

  return { ok: true, id: invite.id };
}

export async function listInvites(createdById: number) {
  return prisma.invite.findMany({
    where: { createdById },
    orderBy: { id: "desc" },
    include: { redeemedBy: { select: { username: true } } },
  });
}

// --- accounts ---------------------------------------------------------------

/**
 * Realigns the `User.id` sequence with the highest id in the table.
 *
 * Account 1 is inserted with an **explicit** id - by the seed script, and
 * historically by the app itself when there was only ever one user. Postgres
 * does not advance a sequence for an explicit id, so on a fresh install the
 * sequence still points at 1 while row 1 already exists, and the first invited
 * signup dies on a primary-key collision.
 *
 * Found by the end-to-end test for #60, which is the only place both halves
 * happen in the same database. Called before every signup: one cheap query on a
 * rare path, in exchange for a whole class of impossible-to-debug first-signup
 * failure.
 */
export async function realignUserSequence(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX("id") FROM "User"), 0) + 1, false)`,
  );
}

export type SignupResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "invite" | "username-taken" };

/**
 * Redeems an invite and creates the account it was for.
 *
 * The invite is burned inside the same transaction that creates the user, with
 * a `redeemedAt: null` guard, so two people racing the same link cannot both
 * get an account from it.
 *
 * The new account gets its own copy of the template exercise library - see
 * `seedExerciseLibrary`. That happens outside the transaction on purpose: it is
 * ~30 inserts, and holding a transaction open for it would serialise signups
 * for no benefit. A failure there leaves a usable account with an empty
 * library, which the next YAML upload fills in anyway.
 */
export async function redeemInvite(
  token: string,
  {
    username,
    password,
    name,
    now = new Date(),
  }: { username: string; password: string; name: string; now?: Date },
): Promise<SignupResult> {
  const tokenHash = hashToken(token);
  const passwordHash = await hashPassword(password);

  // See `realignUserSequence`: account 1 was inserted with an explicit id, so
  // without this the first signup on a fresh install collides with it.
  await realignUserSequence();

  let userId: number;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const burned = await tx.invite.updateMany({
        where: { tokenHash, redeemedAt: null, expiresAt: { gt: now } },
        data: { redeemedAt: now },
      });
      if (burned.count === 0) {
        throw new InviteUnusable();
      }

      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          name,
          // Placeholders. The first YAML upload sets these properly, and it is
          // the same screen that would have asked for them anyway.
          weightKg: 0,
          heightCm: 0,
        },
      });

      await tx.invite.update({
        where: { tokenHash },
        data: { redeemedById: user.id },
      });

      return user.id;
    });
  } catch (err) {
    if (err instanceof InviteUnusable) {
      return { ok: false, reason: "invite" };
    }
    // Prisma's unique-violation code. The username was taken between the form
    // check and the insert.
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "username-taken" };
    }
    throw err;
  }

  await seedExerciseLibrary(userId);

  return { ok: true, userId };
}

class InviteUnusable extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

/**
 * Verifies a username and password.
 *
 * Returns null for every failure - unknown user, wrong password, unclaimed
 * account - so the caller has one error path and cannot accidentally reveal
 * which usernames exist. `verifyPassword` spends the same time on each.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, passwordHash: true },
  });

  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  return ok && user ? user.id : null;
}

export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function isAdmin(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  return user?.isAdmin === true;
}

export async function setPassword(userId: number, password: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
}

// --- claiming account 1 -----------------------------------------------------

/**
 * Whether any account still has no password.
 *
 * "Unclaimed" is defined by `passwordHash`, not `username`: the password is
 * what makes an account loggable-into, so an account without one cannot be
 * reached no matter what else it has. Exactly one account can be in this state -
 * account 1, which existed before accounts did. Once it is claimed the answer is
 * permanently false and the claim screen disappears.
 */
export async function unclaimedAccountExists(): Promise<boolean> {
  const count = await prisma.user.count({ where: { passwordHash: null } });
  return count > 0;
}

export type ClaimResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "nothing-to-claim" | "username-taken" };

/**
 * Attaches a username and password to the pre-accounts account.
 *
 * This is the one-time bridge from the shared passphrase to real accounts. The
 * caller is responsible for checking the old passphrase first; this function
 * only refuses when there is nothing left to claim, which is what makes it
 * safe to leave routed after the fact.
 */
export async function claimLegacyAccount({
  username,
  password,
}: {
  username: string;
  password: string;
}): Promise<ClaimResult> {
  const legacy = await prisma.user.findFirst({
    where: { passwordHash: null },
    orderBy: { id: "asc" },
  });
  if (!legacy) {
    return { ok: false, reason: "nothing-to-claim" };
  }

  try {
    await prisma.user.update({
      where: { id: legacy.id },
      data: {
        username,
        passwordHash: await hashPassword(password),
        // Whoever claims the original account is the admin: they are the only
        // person who can hand out invites, and there is nobody else yet.
        isAdmin: true,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "username-taken" };
    }
    throw err;
  }

  return { ok: true, userId: legacy.id };
}

/** Deletes invites that expired without being used. Called by the cleanup cron. */
export async function pruneInvites(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.invite.deleteMany({
    where: { redeemedAt: null, expiresAt: { lt: now } },
  });
  return count;
}
