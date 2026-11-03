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
  "list_rides",
  "create_ride",
  "update_ride",
  "delete_ride",
  "list_due_work",
  "add_task",
  "set_task_done",
  "record_maintenance",
  "replace_component",
  "list_workshop_items",
  "add_workshop_item",
  "update_stock",
  "update_workshop_item",
  "set_restock",
  "receive_item",
  "update_task",
  "update_rule",
  "snooze_rule",
  "list_maintenance",
  "update_maintenance",
  "list_setups",
  "add_setup",
  "archive_workshop_item",
  "get_bike_usage",
  "create_procedure",
  "update_procedure",
  "archive_procedure",
  "create_rides",
  "delete_rides",
  "start_run",
  "get_run",
  "update_run_steps",
  "finish_run",
  "abandon_run",
  "update_setup",
  "delete_setup",
  "delete_maintenance",
  "get_upload_link",
  "list_attachments",
  "update_attachment",
  "delete_attachment",
  "list_procedures",
  "get_procedure",
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
        // The deletes (D-92, D-97, D-98) are marked destructive; every other write is not.
        const deletes = tool.name.startsWith("delete_") || tool.name === "abandon_run";
        expect(tool.annotations.destructiveHint).toBe(deletes);
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
