/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { runOAuthCleanup } from "./route";
import { UNUSED_CLIENT_TTL_MS } from "@/lib/oauth/config";

/**
 * The cleanup job is the half of the open-registration bargain that makes it
 * safe: anyone may register a client, and anything unused is swept. If this
 * silently stopped deleting, `/api/oauth/register` would become an unbounded
 * write to the database by any caller on the internet - and nothing would fail
 * loudly. Hence real tests rather than trusting it by inspection.
 */

const prisma = new PrismaClient();

const NOW = new Date("2026-08-17T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

async function makeClient(id: string, lastUsedAt: Date) {
  return prisma.oAuthClient.create({
    data: {
      id,
      name: `client ${id}`,
      redirectUris: ["https://example.test/cb"],
      scope: "fitme:read",
      lastUsedAt,
    },
  });
}

beforeEach(async () => {
  await prisma.oAuthToken.deleteMany();
  await prisma.oAuthCode.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.rateLimit.deleteMany();
});

afterAll(async () => {
  await prisma.oAuthToken.deleteMany();
  await prisma.oAuthCode.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.$disconnect();
});

describe("runOAuthCleanup", () => {
  it("deletes expired codes and keeps live ones", async () => {
    const client = await makeClient("c1", NOW);
    await prisma.oAuthCode.createMany({
      data: [
        {
          codeHash: "expired",
          clientId: client.id,
          redirectUri: "https://example.test/cb",
          codeChallenge: "x",
          codeChallengeMethod: "S256",
          scope: "fitme:read",
          expiresAt: new Date(NOW.getTime() - 1000),
        },
        {
          codeHash: "live",
          clientId: client.id,
          redirectUri: "https://example.test/cb",
          codeChallenge: "x",
          codeChallengeMethod: "S256",
          scope: "fitme:read",
          expiresAt: new Date(NOW.getTime() + 30_000),
        },
      ],
    });

    const result = await runOAuthCleanup(NOW);

    expect(result.codes).toBe(1);
    const remaining = await prisma.oAuthCode.findMany();
    expect(remaining.map((c) => c.codeHash)).toEqual(["live"]);
  });

  it("keeps an expired access token while its refresh token is still usable", async () => {
    // Access tokens die after an hour but refresh tokens last 30 days. Deleting
    // the row on access expiry would turn a valid refresh into an unexplained
    // failure a client cannot recover from without a full re-authorization.
    const client = await makeClient("c1", NOW);
    await prisma.oAuthToken.create({
      data: {
        accessTokenHash: "stale-access",
        refreshTokenHash: "live-refresh",
        clientId: client.id,
        scope: "fitme:read",
        expiresAt: new Date(NOW.getTime() - HOUR),
        refreshExpiresAt: new Date(NOW.getTime() + 20 * 24 * HOUR),
      },
    });

    const result = await runOAuthCleanup(NOW);

    expect(result.tokens).toBe(0);
    expect(await prisma.oAuthToken.count()).toBe(1);
  });

  it("deletes a token once both lifetimes have lapsed", async () => {
    const client = await makeClient("c1", NOW);
    await prisma.oAuthToken.create({
      data: {
        accessTokenHash: "dead-access",
        refreshTokenHash: "dead-refresh",
        clientId: client.id,
        scope: "fitme:read",
        expiresAt: new Date(NOW.getTime() - 40 * 24 * HOUR),
        refreshExpiresAt: new Date(NOW.getTime() - 10 * 24 * HOUR),
      },
    });

    const result = await runOAuthCleanup(NOW);

    expect(result.tokens).toBe(1);
    expect(await prisma.oAuthToken.count()).toBe(0);
  });

  it("deletes clients that were registered and never used", async () => {
    // This is exactly the residue a registration flood leaves behind:
    // `lastUsedAt` starts equal to `createdAt` and is only bumped by a
    // successful authorize or token exchange.
    await makeClient("flood", new Date(NOW.getTime() - UNUSED_CLIENT_TTL_MS - 1000));
    await makeClient("active", new Date(NOW.getTime() - HOUR));

    const result = await runOAuthCleanup(NOW);

    expect(result.clients).toBe(1);
    const remaining = await prisma.oAuthClient.findMany();
    expect(remaining.map((c) => c.id)).toEqual(["active"]);
  });

  it("does not delete a client still inside the TTL", async () => {
    await makeClient(
      "recent",
      new Date(NOW.getTime() - UNUSED_CLIENT_TTL_MS + HOUR),
    );

    const result = await runOAuthCleanup(NOW);

    expect(result.clients).toBe(0);
  });

  it("deletes rate-limit rows whose window has closed", async () => {
    await prisma.rateLimit.createMany({
      data: [
        { key: "register:1.1.1.1:old", count: 5, windowEndsAt: new Date(NOW.getTime() - 1000) },
        { key: "register:1.1.1.1:new", count: 2, windowEndsAt: new Date(NOW.getTime() + 1000) },
      ],
    });

    const result = await runOAuthCleanup(NOW);

    expect(result.rateLimits).toBe(1);
    const remaining = await prisma.rateLimit.findMany();
    expect(remaining.map((r) => r.key)).toEqual(["register:1.1.1.1:new"]);
  });
});
