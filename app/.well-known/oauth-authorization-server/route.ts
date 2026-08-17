import { NextResponse } from "next/server";
import { issuerUrl, SUPPORTED_SCOPES } from "@/lib/oauth/config";

/**
 * RFC 8414 authorization server metadata.
 *
 * This is the document an MCP client fetches first, and it is what makes
 * "paste the URL into the connector dialog" work: every endpoint below is
 * discovered from here rather than configured by hand.
 *
 * Served from `app/.well-known/...` - dot-prefixed segments are a supported
 * route-handler convention. Note that `proxy.ts` never sees this path: its
 * matcher excludes any segment containing a dot, so no locale redirect applies.
 */
export async function GET() {
  const issuer = issuerUrl();

  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_basic",
        "client_secret_post",
      ],
      // S256 only. OAuth 2.1 forbids `plain`, whose verifier travels in the
      // authorization request and so is visible to anyone who sees the redirect.
      code_challenge_methods_supported: ["S256"],
    },
    {
      headers: {
        // Public, non-secret, and stable. Let clients and the CDN cache it, but
        // keep the window short enough that an issuer change propagates quickly.
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
