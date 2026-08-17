import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProgramSchema } from "./tools/program-schema";

/**
 * Builds the FitMe MCP server.
 *
 * A fresh instance per request. The transport runs stateless (Vercel functions
 * share no memory between invocations, so there is nowhere for a session to
 * live), and a per-request server keeps that honest - no state can accumulate
 * on an instance that the next request will not have.
 *
 * Tool *implementations* live in `lib/mcp/tools/` as plain async functions, so
 * they can be tested directly against Postgres without going through the
 * protocol. This file is only registration.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "fitme", version: "0.1.0" },
    {
      instructions:
        "FitMe is a personal workout tracker. Call get_program_schema before " +
        "writing or editing any program YAML - it returns the authoritative " +
        "template and the closed muscle vocabulary, and invented muscle names " +
        "are rejected by the parser.",
    },
  );

  server.registerTool(
    "get_program_schema",
    {
      title: "Get program YAML schema",
      description:
        "Returns the annotated FitMe program YAML template, the closed muscle " +
        "vocabulary (every allowed value for muscles.primary / muscles.secondary), " +
        "and the validation rules the parser enforces. Call this before drafting " +
        "or editing a program.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const schema = await getProgramSchema();
      return {
        content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
      };
    },
  );

  return server;
}
