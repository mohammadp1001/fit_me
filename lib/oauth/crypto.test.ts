/**
 * @jest-environment node
 */
import { createHash, randomBytes } from "crypto";
import { digestsEqual, hashSecret, randomSecret, verifyPkce } from "./crypto";

describe("randomSecret", () => {
  it("is URL-safe and long enough to be unguessable", () => {
    const secret = randomSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes in base64url.
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, () => randomSecret()));
    expect(seen.size).toBe(100);
  });
});

describe("hashSecret", () => {
  it("is stable for the same input", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
  });

  it("differs for different inputs", () => {
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });

  it("does not contain the plaintext", () => {
    expect(hashSecret("super-secret-value")).not.toContain("super-secret-value");
  });
});

describe("digestsEqual", () => {
  it("matches identical digests", () => {
    const digest = hashSecret("x");
    expect(digestsEqual(digest, digest)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(digestsEqual(hashSecret("x"), hashSecret("y"))).toBe(false);
  });

  it("rejects mismatched lengths without throwing", () => {
    // timingSafeEqual throws on length mismatch, so the guard has to come first.
    expect(digestsEqual("ab", hashSecret("y"))).toBe(false);
  });
});

describe("verifyPkce", () => {
  function challengeFor(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  it("accepts the verifier that produced the challenge", () => {
    const verifier = randomBytes(32).toString("base64url");
    expect(verifyPkce(challengeFor(verifier), "S256", verifier)).toBe(true);
  });

  it("rejects a different verifier", () => {
    const verifier = randomBytes(32).toString("base64url");
    const other = randomBytes(32).toString("base64url");
    expect(verifyPkce(challengeFor(verifier), "S256", other)).toBe(false);
  });

  it("rejects the plain method even when the values match", () => {
    // OAuth 2.1 removes `plain`: the verifier travels in the authorization
    // request, so anyone who sees the redirect can complete the exchange.
    // Accepting it here would silently downgrade every client that asks for it.
    expect(verifyPkce("some-verifier", "plain", "some-verifier")).toBe(false);
  });

  it("rejects an unknown method", () => {
    const verifier = randomBytes(32).toString("base64url");
    expect(verifyPkce(challengeFor(verifier), "S512", verifier)).toBe(false);
  });

  it("rejects a challenge that is a prefix of the correct one", () => {
    const verifier = randomBytes(32).toString("base64url");
    const truncated = challengeFor(verifier).slice(0, 20);
    expect(verifyPkce(truncated, "S256", verifier)).toBe(false);
  });
});
