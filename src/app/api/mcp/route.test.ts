import { describe, expect, it } from "vitest";
import { generateToken, issueToken } from "@/server/auth/tokens";
import { revokeApiToken } from "@/server/db";
import { createTestContext } from "@/test/context";
import { mcpRequest, rpc } from "@/test/mcp";
import { GET } from "./route";

const TOOLS = [
  "list_bikes",
  "get_bike",
  "create_bike",
  "update_bike",
  "list_component_types",
  "add_component",
  "update_component",
  "set_suspension_specs",
  "list_rules",
  "add_rule",
];

describe("POST /api/mcp (D-90)", () => {
  const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

  it("answers 401 without a valid token, whatever the session", async () => {
    for (const token of [null, "bb_short", generateToken().token]) {
      const response = await mcpRequest(token, listTools);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    }
    const ctx = createTestContext("Revoked");
    const { token, tokenId } = issueToken(ctx, "Mac");
    expect((await mcpRequest(token, listTools)).status).toBe(200);
    revokeApiToken(ctx, tokenId);
    expect((await mcpRequest(token, listTools)).status).toBe(401);
  });

  it("refuses GET (no SSE stream: stateless) and bodies over 1 MB", async () => {
    const { token } = issueToken(createTestContext("Methods"), "Mac");
    const get = await GET(
      new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await GET(new Request("http://localhost/api/mcp"))).status).toBe(401);

    const big = JSON.stringify({ ...listTools, params: { padding: "x".repeat(1024 * 1024) } });
    expect((await mcpRequest(token, big)).status).toBe(413);
  });

  it("lists the tools, read ones marked read-only, in JSON (no SSE)", async () => {
    const { token } = issueToken(createTestContext("Lister"), "Mac");
    const response = await mcpRequest(token, listTools);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const { result } = await response.json();
    const tools = result.tools as {
      name: string;
      annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
      inputSchema: { properties: Record<string, unknown> };
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOLS].sort());
    for (const tool of tools) {
      const reads = tool.name.startsWith("list_") || tool.name.startsWith("get_");
      expect(tool.annotations.readOnlyHint).toBe(reads);
      if (!reads) {
        expect(tool.annotations.destructiveHint).toBe(false);
        expect(tool.inputSchema.properties).toHaveProperty("dry_run");
      }
      // An unknown field is refused, not ignored.
      expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
      // The frame number never travels through the MCP.
      expect(JSON.stringify(tool.inputSchema)).not.toContain("frame_serial");
    }
  });

  it("serves the 2026-07-28 revision as well, in JSON", async () => {
    const { token } = issueToken(createTestContext("Modern"), "Mac");
    const { status, body } = await rpc(
      token,
      "tools/call",
      { name: "list_bikes", arguments: {} },
      { modern: true },
    );
    expect(status).toBe(200);
    expect(body.result.structuredContent).toEqual({ bikes: [], next_cursor: null });
  });
});
