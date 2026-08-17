/**
 * Tunables for the OAuth 2.1 provider fronting the MCP server.
 *
 * Collected here rather than inlined so the security-relevant numbers are
 * visible in one place and can be asserted directly in tests.
 */

/** Authorization codes are single-use and short-lived. */
export const CODE_TTL_MS = 60_000;

/** Access tokens expire in an hour; clients refresh silently. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Refresh tokens last 30 days and rotate on every use. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Clients that never completed an authorization are deleted after this long.
 * A registration flood leaves exactly that behind, so this is the cleanup that
 * makes open Dynamic Client Registration safe to expose.
 */
export const UNUSED_CLIENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hard ceiling on stored clients. Registration is unauthenticated, so without
 * a cap a determined caller could grow the table without bound between cleanup
 * runs. At the cap, registration fails closed rather than evicting rows that a
 * legitimate client may still be mid-flow with.
 */
export const MAX_CLIENTS = 50;

/** Fixed-window rate limit on `POST /api/oauth/register`. */
export const REGISTER_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

/**
 * Scopes this server understands.
 *
 * `fitme:write` is advertised from the start even though #52 ships only read
 * tools - adding a scope later would force every already-connected client to
 * re-authorize.
 */
export const SUPPORTED_SCOPES = ["fitme:read", "fitme:write"] as const;

export type Scope = (typeof SUPPORTED_SCOPES)[number];

/**
 * The issuer / resource origin, used in metadata documents and as the token
 * audience.
 *
 * Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` without a scheme. The explicit
 * `MCP_ISSUER_URL` override exists for preview deployments and local dev,
 * where the inferred origin would otherwise be wrong.
 */
export function issuerUrl(): string {
  const explicit = process.env.MCP_ISSUER_URL;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  return "http://localhost:3000";
}

/** Canonical URL of the MCP endpoint itself (the OAuth "resource"). */
export function resourceUrl(): string {
  return `${issuerUrl()}/api/mcp`;
}
