import { NextResponse } from "next/server";
import { issuerUrl, resourceUrl, SUPPORTED_SCOPES } from "@/lib/oauth/config";

/**
 * RFC 9728 protected resource metadata.
 *
 * The MCP authorization spec requires this document: a client that gets a 401
 * from `/api/mcp` reads the `WWW-Authenticate` header, fetches this, and learns
 * which authorization server to use. Here the resource and the authorization
 * server are the same deployment, but the indirection is what the client
 * expects, so it is served rather than assumed.
 */
export async function GET() {
  return NextResponse.json(
    {
      resource: resourceUrl(),
      authorization_servers: [issuerUrl()],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
