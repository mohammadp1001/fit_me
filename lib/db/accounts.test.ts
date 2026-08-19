/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import {
  authenticate,
  checkInvite,
  claimLegacyAccount,
  createInvite,
  isAdmin,
  pruneInvites,
  redeemInvite,
  unclaimedAccountExists,
} from "./accounts";
import { checkPasswordStrength, checkUsername } from "@/lib/auth/password";

/**
 * Accounts and invites.
 *
 * Signup is invite-only, so the invite is the entire access-control boundary:
 * everything here is about it being genuinely single-use, genuinely expiring,
 * and impossible to sidestep.
 */

const prisma = new PrismaClient();

const TAG = Date.now();
/** Unique per assertion, so a leftover row from a failed run cannot collide. */
let seq = 0;
const uniq = (prefix: string) => `${prefix}-${TAG}-${++seq}`;
const PASSWORD = "a-long-enough-password";
let adminId: number;

beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Admin", weightKg: 80, heightCm: 180 },
  });
  adminId = admin.id;
  await prisma.user.update({
    where: { id: adminId },
    data: { isAdmin: true, username: `admin-${TAG}`, passwordHash: null },
  });
});

afterEach(async () => {
  await prisma.invite.deleteMany({ where: { createdById: adminId } });
  // Every account except the admin is created by a test.
  const strays = await prisma.user.findMany({
    where: { id: { not: adminId } },
    select: { id: true },
  });
  for (const s of strays) {
    await prisma.exercise.deleteMany({ where: { userId: s.id } });
    await prisma.user.delete({ where: { id: s.id } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("invites", () => {
  it("returns a token once and stores only its hash", async () => {
    const invite = await createInvite(adminId, { label: "for a friend" });

    expect(invite.token).toEqual(expect.any(String));

    const rows = await prisma.invite.findMany({ where: { createdById: adminId } });
    expect(rows).toHaveLength(1);
    // A database leak must not yield usable signup links.
    expect(rows[0].tokenHash).not.toBe(invite.token);
    expect(rows[0].label).toBe("for a friend");
  });

  it("accepts a fresh token", async () => {
    const invite = await createInvite(adminId);

    expect(await checkInvite(invite.token)).toMatchObject({ ok: true });
  });

  it("rejects an unknown token", async () => {
    expect(await checkInvite("not-a-real-token")).toMatchObject({
      ok: false,
      reason: "unknown",
    });
  });

  it("rejects an expired token", async () => {
    const invite = await createInvite(adminId);
    const later = new Date(invite.expiresAt.getTime() + 1000);

    expect(await checkInvite(invite.token, later)).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("deletes expired unused invites and keeps live ones", async () => {
    const stale = await createInvite(adminId, {
      now: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const live = await createInvite(adminId);

    const deleted = await pruneInvites();

    expect(deleted).toBe(1);
    expect(await checkInvite(live.token)).toMatchObject({ ok: true });
    expect(await checkInvite(stale.token)).toMatchObject({ reason: "unknown" });
  });
});

describe("signing up with an invite", () => {
  it("creates an account with its own exercise library", async () => {
    const invite = await createInvite(adminId);

    const result = await redeemInvite(invite.token, {
      username: uniq("friend"),
      password: PASSWORD,
      name: "Friend",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected ok");

    const owned = await prisma.exercise.count({ where: { userId: result.userId } });
    expect(owned).toBeGreaterThan(20);

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    expect(user!.username).toEqual(expect.stringContaining("friend"));
    expect(user!.isAdmin).toBe(false);
    // The hash is a hash, not the password.
    expect(user!.passwordHash).not.toBe(PASSWORD);
  });

  it("burns the invite so it cannot be used twice", async () => {
    const invite = await createInvite(adminId);

    const first = await redeemInvite(invite.token, {
      username: uniq("first"),
      password: PASSWORD,
      name: "First",
    });
    const second = await redeemInvite(invite.token, {
      username: uniq("second"),
      password: PASSWORD,
      name: "Second",
    });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: false, reason: "invite" });
    expect(await prisma.user.count({ where: { id: { not: adminId } } })).toBe(1);
  });

  it("cannot be used twice even when two signups race it", async () => {
    // The invite is burned inside the same transaction that creates the user,
    // guarded on `redeemedAt: null`. Without that guard both callers would see
    // an unredeemed invite and both would get an account.
    const invite = await createInvite(adminId);

    const results = await Promise.all([
      redeemInvite(invite.token, {
        username: uniq("racer-a"),
        password: PASSWORD,
        name: "A",
      }),
      redeemInvite(invite.token, {
        username: uniq("racer-b"),
        password: PASSWORD,
        name: "B",
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.user.count({ where: { id: { not: adminId } } })).toBe(1);
  });

  it("works on a fresh install where account 1 was inserted with an explicit id", async () => {
    // Postgres does not advance a sequence for an explicitly-supplied id, so on
    // a fresh database the `User` sequence still points at 1 while row 1 exists.
    // Without `realignUserSequence` the first ever signup dies on a primary-key
    // collision - found by the #60 end-to-end run, not by any unit test.
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"User"', 'id'), 1, false)`,
    );

    const invite = await createInvite(adminId);
    const result = await redeemInvite(invite.token, {
      username: uniq("fresh"),
      password: PASSWORD,
      name: "Fresh",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("refuses an expired invite", async () => {
    const invite = await createInvite(adminId, {
      now: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const result = await redeemInvite(invite.token, {
      username: uniq("late"),
      password: PASSWORD,
      name: "Late",
    });

    expect(result).toMatchObject({ ok: false, reason: "invite" });
  });

  it("refuses a username that is already taken, without burning the invite", async () => {
    const first = await createInvite(adminId);
    await redeemInvite(first.token, {
      username: `taken-${TAG}`,
      password: PASSWORD,
      name: "First",
    });

    const second = await createInvite(adminId);
    const clash = await redeemInvite(second.token, {
      username: `taken-${TAG}`,
      password: PASSWORD,
      name: "Second",
    });

    expect(clash).toMatchObject({ ok: false, reason: "username-taken" });
    // The invite is still usable with a different name - a name clash is the
    // signer-up's problem, not a reason to void their link.
    const retry = await redeemInvite(second.token, {
      username: `other-${TAG}`,
      password: PASSWORD,
      name: "Second",
    });
    expect(retry).toMatchObject({ ok: true });
  });
});

describe("authenticate", () => {
  async function makeUser(username: string) {
    const invite = await createInvite(adminId);
    const result = await redeemInvite(invite.token, {
      username,
      password: PASSWORD,
      name: "Someone",
    });
    if (!result.ok) throw new Error("setup failed");
    return result.userId;
  }

  it("accepts the right password", async () => {
    const id = await makeUser(`auth-${TAG}`);

    expect(await authenticate(`auth-${TAG}`, PASSWORD)).toBe(id);
  });

  it("rejects the wrong password", async () => {
    await makeUser(`auth-${TAG}`);

    expect(await authenticate(`auth-${TAG}`, "not-the-password")).toBeNull();
  });

  it("rejects an unknown username", async () => {
    expect(await authenticate(`nobody-${TAG}`, PASSWORD)).toBeNull();
  });

  it("rejects an account that has no password yet", async () => {
    // The admin row is deliberately left unclaimed by this suite's fixture.
    // An account with no credentials must not be loggable-into by any input.
    expect(await authenticate(`admin-${TAG}`, PASSWORD)).toBeNull();
    expect(await authenticate(`admin-${TAG}`, "")).toBeNull();
  });
});

describe("claiming the pre-accounts account", () => {
  it("reports that an unclaimed account exists", async () => {
    expect(await unclaimedAccountExists()).toBe(true);
  });

  it("attaches credentials to the existing account and makes it admin", async () => {
    const before = await prisma.user.findUnique({ where: { id: adminId } });

    const result = await claimLegacyAccount({
      username: `claimed-${TAG}`,
      password: PASSWORD,
    });

    expect(result).toMatchObject({ ok: true, userId: adminId });

    const after = await prisma.user.findUnique({ where: { id: adminId } });
    expect(after!.username).toBe(`claimed-${TAG}`);
    expect(after!.isAdmin).toBe(true);
    // The history is untouched - claiming attaches credentials, it does not
    // create a new account.
    expect(after!.name).toBe(before!.name);
    expect(await authenticate(`claimed-${TAG}`, PASSWORD)).toBe(adminId);

    // Restore the unclaimed state for the other tests in this file.
    await prisma.user.update({
      where: { id: adminId },
      data: { username: `admin-${TAG}`, passwordHash: null },
    });
  });

  it("refuses once every account has credentials", async () => {
    await prisma.user.update({
      where: { id: adminId },
      data: { username: `admin-${TAG}`, passwordHash: "x" },
    });

    try {
      expect(await unclaimedAccountExists()).toBe(false);
      expect(
        await claimLegacyAccount({ username: `again-${TAG}`, password: PASSWORD }),
      ).toMatchObject({ ok: false, reason: "nothing-to-claim" });
    } finally {
      await prisma.user.update({
        where: { id: adminId },
        data: { username: `admin-${TAG}`, passwordHash: null },
      });
    }
  });
});

describe("admin", () => {
  it("is true for the original account and false for an invited one", async () => {
    const invite = await createInvite(adminId);
    const result = await redeemInvite(invite.token, {
      username: uniq("plain"),
      password: PASSWORD,
      name: "Plain",
    });
    if (!result.ok) throw new Error("setup failed");

    expect(await isAdmin(adminId)).toBe(true);
    expect(await isAdmin(result.userId)).toBe(false);
  });
});

describe("input rules", () => {
  it("requires a password long enough to matter", () => {
    expect(checkPasswordStrength("short")).toMatchObject({ ok: false });
    expect(checkPasswordStrength("0123456789")).toMatchObject({ ok: true });
  });

  it("lowercases usernames so casing cannot split an account", () => {
    expect(checkUsername("MoHaMmAd")).toMatchObject({ ok: true, value: "mohammad" });
  });

  it("rejects usernames that would be ambiguous in a URL", () => {
    expect(checkUsername("a b")).toMatchObject({ ok: false });
    expect(checkUsername("emoji-thing-x")).toMatchObject({ ok: true });
    expect(checkUsername("ab")).toMatchObject({ ok: false });
  });
});
