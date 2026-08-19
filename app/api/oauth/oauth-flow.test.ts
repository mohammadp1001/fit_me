/**
 * @jest-environment node
 */
import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";

/**
 * Drives the whole authorization flow through the real route handlers, against
 * a real Postgres. This is the closest thing to what an MCP client actually
 * does, and every security property in #52 is asserted here rather than against
 * the helper functions in isolation - a guard that exists in `lib/` but is not
 * reached by the route protects nothing.
 */

// The session module is the one piece that cannot run under jest (it reads
// `cookies()` from a request scope that does not exist here), so it is faked
// with a mutable id standing in for "which account is signed in".
let signedInAs: number | null = null;

jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => signedInAs !== null),
  sessionUserId: jest.fn(async () => signedInAs),
  signIn: jest.fn(async (userId: number) => {
    signedInAs = userId;
  }),
  signOut: jest.fn(async () => {
    signedInAs = null;
  }),
}));

import { MAX_CLIENTS, REGISTER_RATE_LIMIT } from "@/lib/oauth/config";
import { POST as register } from "./register/route";
import { GET as authorizeGet, POST as authorizePost } from "./authorize/route";
import { POST as token } from "./token/route";

const prisma = new PrismaClient();

const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";
const USERNAME = `oauth-user-${Date.now()}`;
const PASSWORD = "correct-horse-battery";
let userId: number;

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(overrides: Record<string, unknown> = {}) {
  const res = await register(
    new NextRequest("http://localhost/api/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [REDIRECT_URI],
        client_name: "Test MCP Client",
        ...overrides,
      }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

function authorizeUrl(params: Record<string, string>) {
  const url = new URL("http://localhost/api/oauth/authorize");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function postAuthorize(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return authorizePost(
    new NextRequest("http://localhost/api/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }),
  );
}

async function postToken(fields: Record<string, string>) {
  const res = await token(
    new NextRequest("http://localhost/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }),
  );
  return { status: res.status, body: await res.json(), headers: res.headers };
}

/** Registers a client, signs in, clicks Allow, and returns the code. */
async function getAuthorizationCode(challenge: string) {
  const { body: client } = await registerClient();
  signedInAs = userId;

  const res = await postAuthorize({
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "fitme:read",
    state: "xyz",
    action: "allow",
  });

  const location = new URL(res.headers.get("location")!);
  return { clientId: client.client_id as string, code: location.searchParams.get("code")! };
}

beforeAll(async () => {
  // A real account, because the consent screen now signs in a specific user and
  // the issued code records which one.
  const user = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "OAuth Test User", weightKg: 80, heightCm: 180 },
  });
  userId = user.id;
  await prisma.user.update({
    where: { id: userId },
    data: {
      username: USERNAME,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
});

beforeEach(async () => {
  signedInAs = null;
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

describe("dynamic client registration", () => {
  it("registers a public client without issuing a secret", async () => {
    const { status, body } = await registerClient();

    expect(status).toBe(201);
    expect(body.client_id).toEqual(expect.any(String));
    // PKCE clients are public: a secret shipped to a desktop app or a browser
    // is not a secret, and OAuth 2.1 expects `none` here.
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("issues a secret only for a confidential client", async () => {
    const { body } = await registerClient({
      token_endpoint_auth_method: "client_secret_basic",
    });

    expect(body.client_secret).toEqual(expect.any(String));
  });

  it("rejects registration with no redirect_uris", async () => {
    const { status, body } = await registerClient({ redirect_uris: [] });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_client_metadata");
  });

  it("ignores unknown metadata rather than failing the connection", async () => {
    // Real clients send client_uri, logo_uri, contacts and more. None of them
    // change this server's behaviour, and rejecting them would break connect
    // for no security gain.
    const { status } = await registerClient({
      logo_uri: "https://claude.ai/logo.png",
      contacts: ["support@example.com"],
    });

    expect(status).toBe(201);
  });
});

describe("registration abuse limits", () => {
  it("rate-limits a flood from one IP", async () => {
    // Registration is unauthenticated by design, so this limit plus the row cap
    // below are the only things bounding what an anonymous caller can write.
    const ip = "203.0.113.7";
    const send = () =>
      register(
        new NextRequest("http://localhost/api/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
        }),
      );

    const statuses: number[] = [];
    for (let i = 0; i < REGISTER_RATE_LIMIT.limit + 2; i++) {
      statuses.push((await send()).status);
    }

    expect(statuses.filter((s) => s === 201)).toHaveLength(
      REGISTER_RATE_LIMIT.limit,
    );
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it("counts each IP separately", async () => {
    const send = (ip: string) =>
      register(
        new NextRequest("http://localhost/api/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
        }),
      );

    for (let i = 0; i < REGISTER_RATE_LIMIT.limit; i++) {
      await send("198.51.100.1");
    }
    const other = await send("198.51.100.2");

    expect(other.status).toBe(201);
  });

  it("takes the first entry of a forwarded chain", async () => {
    // Vercel appends proxies to x-forwarded-for; the real client is first.
    // Reading the last entry would bucket every request under the same proxy.
    const send = () =>
      register(
        new NextRequest("http://localhost/api/oauth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2",
          },
          body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
        }),
      );

    for (let i = 0; i < REGISTER_RATE_LIMIT.limit; i++) {
      await send();
    }

    expect((await send()).status).toBe(429);
    const keys = await prisma.rateLimit.findMany();
    expect(keys.every((k) => k.key.includes("203.0.113.9"))).toBe(true);
  });

  it("fails closed at the client cap instead of evicting a live client", async () => {
    // Evicting the oldest row would let an attacker knock out a legitimate
    // client mid-flow, turning a storage bound into a denial of service.
    await prisma.oAuthClient.createMany({
      data: Array.from({ length: MAX_CLIENTS }, (_, i) => ({
        id: `filler-${i}`,
        name: "filler",
        redirectUris: [REDIRECT_URI],
        scope: "fitme:read",
      })),
    });

    const { status, body } = await registerClient();

    expect(status).toBe(503);
    expect(body.error).toBe("temporarily_unavailable");
    expect(await prisma.oAuthClient.count()).toBe(MAX_CLIENTS);
  });
});

describe("authorize: the gate", () => {
  it("shows the sign-in form when there is no session", async () => {
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      ),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("Sign in to continue");
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
  });

  it("shows the consent screen when a session exists", async () => {
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();
    signedInAs = userId;

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      ),
    );
    const html = await res.text();

    expect(html).toContain("Allow access?");
    expect(html).toContain("Test MCP Client");
  });

  it("does not treat correct credentials as consent", async () => {
    // Signing in and approving are separate decisions. If credentials alone
    // issued a code, a user who only meant to log in would have granted access.
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();

    const res = await postAuthorize({
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      username: USERNAME,
      password: PASSWORD,
      action: "continue",
    });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("Allow access?");
    expect(await prisma.oAuthCode.count()).toBe(0);
  });

  it("rejects wrong credentials and issues nothing", async () => {
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();

    const res = await postAuthorize({
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      username: USERNAME,
      password: "wrong-password",
      action: "continue",
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Incorrect username or password");
    expect(await prisma.oAuthCode.count()).toBe(0);
  });

  it("redirects with access_denied when the user clicks Deny", async () => {
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();
    signedInAs = userId;

    const res = await postAuthorize({
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      action: "deny",
    });

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(await prisma.oAuthCode.count()).toBe(0);
  });

  it("refuses an unregistered redirect_uri on-page instead of redirecting", async () => {
    // Redirecting an unvalidated URI is the open-redirect this must not do.
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();
    signedInAs = userId;

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: "https://attacker.example/steal",
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toContain("does not match any registered URI");
  });

  it("refuses a redirect_uri that merely extends a registered one", async () => {
    const { body: client } = await registerClient();
    const { challenge } = pkcePair();
    signedInAs = userId;

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: `${REDIRECT_URI}.attacker.example`,
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      ),
    );

    expect(res.status).toBe(400);
  });

  it("requires PKCE", async () => {
    const { body: client } = await registerClient();
    signedInAs = userId;

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
        }),
      ),
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("refuses code_challenge_method=plain", async () => {
    const { body: client } = await registerClient();
    signedInAs = userId;

    const res = await authorizeGet(
      new NextRequest(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          code_challenge: "whatever",
          code_challenge_method: "plain",
        }),
      ),
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });
});

describe("token: code exchange", () => {
  it("exchanges a valid code for tokens", async () => {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const { status, body, headers } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });

    expect(status).toBe(200);
    expect(body.access_token).toEqual(expect.any(String));
    expect(body.refresh_token).toEqual(expect.any(String));
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    // RFC 6749 §5.1 - a cached token response is a token leak.
    expect(headers.get("cache-control")).toContain("no-store");
  });

  it("stores no plaintext token in the database", async () => {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const { body } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });

    const rows = await prisma.oAuthToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].accessTokenHash).not.toBe(body.access_token);
    expect(rows[0].refreshTokenHash).not.toBe(body.refresh_token);
  });

  it("rejects a replayed authorization code", async () => {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const first = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });
    const second = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("invalid_grant");
    // Still exactly one grant: the replay must not mint a second.
    expect(await prisma.oAuthToken.count()).toBe(1);
  });

  it("rejects a bad PKCE verifier", async () => {
    const { challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const { status, body } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: randomBytes(32).toString("base64url"),
      client_id: clientId,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_grant");
    expect(await prisma.oAuthToken.count()).toBe(0);
  });

  it("rejects an expired code", async () => {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    await prisma.oAuthCode.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const { status, body } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects a code redeemed with a different redirect_uri", async () => {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const { status } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://claude.ai/other",
      code_verifier: verifier,
      client_id: clientId,
    });

    expect(status).toBe(400);
  });

  it("rejects a code redeemed by a different client", async () => {
    const { verifier, challenge } = pkcePair();
    const { code } = await getAuthorizationCode(challenge);
    const { body: other } = await registerClient({ client_name: "Other" });

    const { status } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: other.client_id,
    });

    expect(status).toBe(400);
  });

  it("gives the same error for every failure mode", async () => {
    // Distinguishing "expired" from "already used" from "wrong verifier" would
    // hand an attacker a probe against codes they do not hold.
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);

    const wrongVerifier = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: randomBytes(32).toString("base64url"),
      client_id: clientId,
    });
    const unknownCode = await postToken({
      grant_type: "authorization_code",
      code: "not-a-real-code",
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });

    expect(wrongVerifier.body).toEqual(unknownCode.body);
  });

  it("rejects an unknown client", async () => {
    const { status, body } = await postToken({
      grant_type: "authorization_code",
      code: "x",
      redirect_uri: REDIRECT_URI,
      code_verifier: "y",
      client_id: "nonexistent",
    });

    expect(status).toBe(401);
    expect(body.error).toBe("invalid_client");
  });

  it("rejects a confidential client presenting the wrong secret", async () => {
    const { body: client } = await registerClient({
      token_endpoint_auth_method: "client_secret_post",
    });

    const { status, body } = await postToken({
      grant_type: "authorization_code",
      code: "x",
      redirect_uri: REDIRECT_URI,
      code_verifier: "y",
      client_id: client.client_id,
      client_secret: "wrong-secret",
    });

    expect(status).toBe(401);
    expect(body.error).toBe("invalid_client");
  });

  it("rejects an unsupported grant type", async () => {
    const { body: client } = await registerClient();

    const { status, body } = await postToken({
      grant_type: "password",
      client_id: client.client_id,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_grant_type");
  });
});

describe("token: refresh rotation", () => {
  async function grantTokens() {
    const { verifier, challenge } = pkcePair();
    const { clientId, code } = await getAuthorizationCode(challenge);
    const { body } = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
    });
    return { clientId, tokens: body };
  }

  it("rotates the refresh token on use", async () => {
    const { clientId, tokens } = await grantTokens();

    const { status, body } = await postToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });

    expect(status).toBe(200);
    expect(body.access_token).not.toBe(tokens.access_token);
    expect(body.refresh_token).not.toBe(tokens.refresh_token);
  });

  it("rejects reuse of an already-rotated refresh token", async () => {
    const { clientId, tokens } = await grantTokens();

    await postToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });
    const replay = await postToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });

    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
  });

  it("rejects a refresh token presented by another client", async () => {
    const { tokens } = await grantTokens();
    const { body: other } = await registerClient({ client_name: "Other" });

    const { status } = await postToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: other.client_id,
    });

    expect(status).toBe(400);
  });
});
