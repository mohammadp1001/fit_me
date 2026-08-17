/**
 * @jest-environment node
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server";
import { ALL_MUSCLES } from "@/lib/muscles";

/**
 * Protocol-level smoke tests.
 *
 * The tool logic itself is tested directly in `lib/mcp/tools/`. What these
 * cover is the wiring: a tool that is implemented but never registered would
 * otherwise pass every unit test and still be invisible to the chatbot.
 */
async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer();
  const client = new Client({ name: "test", version: "1.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

describe("MCP server wiring", () => {
  it("advertises the server identity on initialize", async () => {
    const { client, close } = await connectedClient();

    expect(client.getServerVersion()).toMatchObject({ name: "fitme" });

    await close();
  });

  it("lists every registered tool", async () => {
    const { client, close } = await connectedClient();

    const { tools } = await client.listTools();

    // Update this list when a tool is added. It is the guard against shipping
    // a tool that exists in `lib/` but was never registered here.
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_body_weight",
      "get_coach_memory",
      "get_exercise_history",
      "get_program",
      "get_program_schema",
      "get_progress_summary",
      "get_volume",
      "list_exercises",
      "list_programs",
      "validate_program_yaml",
    ]);

    await close();
  });

  it("declares every tool read-only", async () => {
    // #53 ships no writes at all. The first tool without this annotation should
    // be a deliberate decision in #54, not an oversight here.
    const { client, close } = await connectedClient();

    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }

    await close();
  });

  it("gives every tool a description and a title", async () => {
    // These are the only thing the model has to choose between ten tools.
    const { client, close } = await connectedClient();

    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(30);
      expect(tool.title ?? tool.annotations?.title).toEqual(expect.any(String));
    }

    await close();
  });

  it("surfaces a resolution failure as a readable tool error", async () => {
    // The strict resolver puts near-matches in its message. That only helps if
    // the message reaches the model instead of becoming a transport failure.
    const { client, close } = await connectedClient();

    const result = await client.callTool({
      name: "get_exercise_history",
      arguments: { name: "Definitely Not A Real Exercise" },
    });
    const content = result.content as Array<{ type: string; text: string }>;

    expect(result.isError).toBe(true);
    expect(content[0].text).toContain("Definitely Not A Real Exercise");

    await close();
  });

  it("rejects arguments that violate a tool's input schema", async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({
      name: "get_progress_summary",
      arguments: { weeks: 0 },
    });

    expect(result.isError).toBe(true);

    await close();
  });

  it("declares get_program_schema as read-only", async () => {
    const { client, close } = await connectedClient();

    const { tools } = await client.listTools();
    const schemaTool = tools.find((t) => t.name === "get_program_schema");

    expect(schemaTool?.annotations?.readOnlyHint).toBe(true);
    expect(schemaTool?.description).toContain("muscle");

    await close();
  });

  it("dispatches tools/call and returns the schema payload", async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({ name: "get_program_schema" });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);

    expect(content[0].type).toBe("text");
    expect(payload.template).toContain("days:");
    expect(payload.rules.length).toBeGreaterThan(0);
    // Every muscle the parser accepts must be advertised - a short list here is
    // how a chatbot ends up inventing names the upload will reject.
    expect(payload.muscles.map((m: { value: string }) => m.value).sort()).toEqual(
      [...ALL_MUSCLES].sort(),
    );

    await close();
  });

  it("reports an unknown tool in-band rather than throwing", async () => {
    // The SDK answers an unknown tool with `isError: true` in the result, not a
    // transport-level rejection. That is deliberate on its part and matters
    // here: the model has to be able to read the failure and correct itself,
    // which it cannot do if the call blows up the connection instead.
    const { client, close } = await connectedClient();

    const result = await client.callTool({ name: "no_such_tool" });
    const content = result.content as Array<{ type: string; text: string }>;

    expect(result.isError).toBe(true);
    expect(content[0].text).toContain("no_such_tool");

    await close();
  });
});
