import { NextRequest, NextResponse } from "next/server";
import { findClient, touchClient } from "@/lib/oauth/clients";
import { consumeCode } from "@/lib/oauth/codes";
import { issueTokens, refreshTokens } from "@/lib/oauth/tokens";
import { digestsEqual, hashSecret } from "@/lib/oauth/crypto";

/**
 * The token endpoint: authorization code exchange and refresh rotation.
 *
 * Every failure returns `invalid_grant` or `invalid_client` with no detail.
 * Distinguishing "expired" from "already used" from "wrong verifier" would give
 * an attacker a probe against codes they do not hold.
 */

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      // RFC 6749 §5.1: token responses must never be cached.
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    },
  );
}

function tokenResponse(body: unknown) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

/**
 * Resolves the client and checks its secret if it is confidential.
 *
 * Supports `client_secret_basic` (Authorization header) and
 * `client_secret_post` (body), because clients pick one or the other and the
 * metadata document advertises both.
 */
async function authenticateClient(request: NextRequest, form: URLSearchParams) {
  let clientId = form.get("client_id")?.trim();
  let clientSecret = form.get("client_secret")?.trim();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator !== -1) {
      clientId = decodeURIComponent(decoded.slice(0, separator));
      clientSecret = decodeURIComponent(decoded.slice(separator + 1));
    }
  }

  if (!clientId) {
    return { ok: false as const, error: "client_id is required" };
  }

  const client = await findClient(clientId);
  if (!client) {
    return { ok: false as const, error: "Unknown client" };
  }

  if (client.secretHash) {
    if (!clientSecret || !digestsEqual(client.secretHash, hashSecret(clientSecret))) {
      return { ok: false as const, error: "Invalid client credentials" };
    }
  }

  return { ok: true as const, client };
}

export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());

  const auth = await authenticateClient(request, form);
  if (!auth.ok) {
    return oauthError("invalid_client", auth.error, 401);
  }

  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const codeVerifier = form.get("code_verifier");

    if (!code || !redirectUri || !codeVerifier) {
      return oauthError(
        "invalid_request",
        "code, redirect_uri and code_verifier are required.",
      );
    }

    const consumed = await consumeCode(code, {
      clientId: auth.client.id,
      redirectUri,
      codeVerifier,
    });

    if (!consumed.ok) {
      return oauthError("invalid_grant", "The authorization code is not valid.");
    }

    const tokens = await issueTokens({
      clientId: auth.client.id,
      scope: consumed.scope,
      resource: consumed.resource,
    });
    await touchClient(auth.client.id);
    return tokenResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) {
      return oauthError("invalid_request", "refresh_token is required.");
    }

    const refreshed = await refreshTokens(refreshToken, auth.client.id);
    if (!refreshed.ok) {
      return oauthError("invalid_grant", "The refresh token is not valid.");
    }

    await touchClient(auth.client.id);
    return tokenResponse(refreshed.tokens);
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token.",
  );
}
