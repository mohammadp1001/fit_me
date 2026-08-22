/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { createInvite, redeemInvite } from "./accounts";
import { getUser, updateUser } from "./user";
import { localDay } from "@/lib/time";

const prisma = new PrismaClient();

const TAG = Date.now();
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
    data: { isAdmin: true, username: `tz-admin-${TAG}`, passwordHash: null },
  });
});

afterEach(async () => {
  await prisma.invite.deleteMany({ where: { createdById: adminId } });
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

async function signUp(timeZone?: string) {
  const invite = await createInvite(adminId);
  const result = await redeemInvite(invite.token, {
    username: uniq("tzuser"),
    password: PASSWORD,
    name: "Timezone Tester",
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  if (!result.ok) throw new Error(`signup failed: ${result.reason}`);
  return result.userId;
}

describe("a user's timezone", () => {
  it("is stored at signup from what the browser reported", async () => {
    const userId = await signUp("Asia/Tehran");
    const user = await getUser(userId);
    expect(user!.timeZone).toBe("Asia/Tehran");
  });

  // An old client, or one whose Intl returns nothing, must still sign up.
  it("falls back to UTC when the client sent nothing", async () => {
    const userId = await signUp();
    const user = await getUser(userId);
    expect(user!.timeZone).toBe("UTC");
  });

  it("is editable afterwards", async () => {
    const userId = await signUp("UTC");
    await updateUser(userId, { timeZone: "Europe/London" });
    expect((await getUser(userId))!.timeZone).toBe("Europe/London");
  });

  // The whole point of the column: a 21:00 Tehran workout is 17:30Z, and
  // filed by UTC it would land on the wrong day near midnight.
  it("decides which local day an instant belongs to", async () => {
    const userId = await signUp("Asia/Tehran");
    const user = await getUser(userId);
    const lateEvening = new Date("2026-08-21T21:00:00Z");
    expect(localDay(lateEvening, "UTC")).toBe("2026-08-21");
    expect(localDay(lateEvening, user!.timeZone)).toBe("2026-08-22");
  });

  // The model promises the hash never leaves the server, and both callers of
  // getUser ship their result straight to a browser.
  it("never returns the password hash from getUser", async () => {
    const userId = await signUp("UTC");
    const user = await getUser(userId);
    expect(user).not.toBeNull();
    expect(Object.keys(user!)).not.toContain("passwordHash");
  });
});
