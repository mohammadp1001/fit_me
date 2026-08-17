import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { verifyAccessToken } from "@/lib/oauth/tokens";
import { resourceUrl } from "@/lib/oauth/config";

/**
 * The MCP endpoint.
 *
 * The SDK's `WebStandardStreamableHTTPServerTransport` speaks Web `Request` /
 * `Response`, which is exactly the Next 16 route handler contract - so this is
 * a thin wiring shim with no adapter. (The Express-flavoured
 * `StreamableHTTPServerTransport` wraps this same class for Node req/res; it is
 * the wrong one here.)
 *
 * Stateless: `sessionIdGenerator: undefined`. Vercel functions do not survive
 * between invocations, so a session held in memory would vanish unpredictably
 * and present as a client that randomly loses its connection.
 */

/**
 * A 401 that tells the client where to authenticate.
 *
 * The `WWW-Authenticate` header is what makes discovery work: an unauthenticated
 * client reads `resource_metadata`, fetches it, finds the authorization server,
 * and starts the OAuth flow on its own. Without this header a connector just
 * fails.
 */
function unauthorized(description: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: description },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="fitme", error="invalid_token", error_description="${description}", resource_metadata="${resourceUrl().replace("/api/mcp", "/.well-known/oauth-protected-resource")}"`,
      },
    },
  );
}

async function handle(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return unauthorized("Missing bearer token");
  }

  const verified = await verifyAccessToken(authHeader.slice(7).trim());
  if (!verified) {
    return unauthorized("Invalid or expired token");
  }

  // Scopes are parsed and carried into `authInfo`, but nothing enforces them
  // yet - every tool in #52 is read-only, so there is no privilege to separate.
  // The write tool in #54 must gate on `fitme:write` before it does anything,
  // or the scope is decoration.
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // Return a single JSON response instead of opening an SSE stream. Every
    // tool here is a short request/response; holding a stream open would burn
    // serverless execution time for nothing.
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request, {
      authInfo: {
        token: "",
        clientId: verified.clientId,
        scopes: verified.scopes,
        expiresAt: undefined,
      },
    });
  } finally {
    // The instance is per-request; close it so nothing is left holding a
    // reference if the runtime reuses the container.
    await server.close();
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function DELETE(request: NextRequest) {
  return handle(request);
}
