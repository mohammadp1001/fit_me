import { SUPPORTED_SCOPES } from "./config";

/**
 * Parsing and validation of the authorization request.
 *
 * Split out of the route handler because the same shape is built twice - once
 * from the initial `GET` query string and once from the hidden fields on the
 * consent `POST` - and the two must agree exactly.
 */

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state?: string;
  resource?: string;
}

/**
 * Errors that can be reported by redirecting back to the client, per RFC 6749
 * §4.1.2.1. Failures involving `client_id` or `redirect_uri` are deliberately
 * *not* in this set - those must be shown on-page instead.
 */
export interface RedirectableError {
  error: string;
  description: string;
}

export type ParseResult =
  | { ok: true; params: AuthorizeParams }
  | { ok: false; fatal: string }
  | { ok: false; redirect: RedirectableError; redirectUri: string; state?: string };

/**
 * Validates an authorization request.
 *
 * `clientRedirectUris` comes from the stored client, so the caller must resolve
 * the client first; passing `null` signals an unknown `client_id`.
 */
export function parseAuthorizeParams(
  raw: URLSearchParams,
  clientRedirectUris: string[] | null,
): ParseResult {
  const clientId = raw.get("client_id")?.trim();
  const redirectUri = raw.get("redirect_uri")?.trim();

  if (!clientId) {
    return { ok: false, fatal: "Missing client_id." };
  }
  if (!clientRedirectUris) {
    return { ok: false, fatal: "Unknown client_id. Try reconnecting the app." };
  }

  // Exact match, never prefix. A prefix rule would let
  // `https://claude.ai/callback.attacker.example` pass as
  // `https://claude.ai/callback`.
  if (!redirectUri) {
    return { ok: false, fatal: "Missing redirect_uri." };
  }
  if (!clientRedirectUris.includes(redirectUri)) {
    return {
      ok: false,
      fatal: "redirect_uri does not match any registered URI for this client.",
    };
  }

  // Past this point the redirect URI is trusted, so errors can be reported by
  // redirecting - which is what the client is waiting for.
  const state = raw.get("state") ?? undefined;
  const fail = (error: string, description: string): ParseResult => ({
    ok: false,
    redirect: { error, description },
    redirectUri,
    state,
  });

  if (raw.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }

  const codeChallenge = raw.get("code_challenge")?.trim();
  if (!codeChallenge) {
    return fail("invalid_request", "PKCE is required: code_challenge is missing.");
  }

  // OAuth 2.1 removes `plain`. Defaulting a missing method to `plain` (the RFC
  // 7636 default) would silently downgrade every client that omits it.
  const codeChallengeMethod = raw.get("code_challenge_method") ?? "S256";
  if (codeChallengeMethod !== "S256") {
    return fail(
      "invalid_request",
      "Only code_challenge_method=S256 is supported.",
    );
  }

  const requested = raw.get("scope")?.split(/\s+/).filter(Boolean) ?? [];
  const unknown = requested.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (unknown.length > 0) {
    return fail("invalid_scope", `Unsupported scope: ${unknown.join(", ")}`);
  }
  const scope = (requested.length ? requested : [...SUPPORTED_SCOPES]).join(" ");

  return {
    ok: true,
    params: {
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      state,
      resource: raw.get("resource") ?? undefined,
    },
  };
}

/** Builds the redirect back to the client for either success or failure. */
export function buildRedirect(
  redirectUri: string,
  fields: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
