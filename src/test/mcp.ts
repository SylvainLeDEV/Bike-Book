import { POST } from "@/app/api/mcp/route";

// Calls the MCP route as a client of the 2025 revisions does (stateless, JSON answers), or with
// the 2026-07-28 envelope (`modern`). Tests only.

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "vitest", version: "1" },
};

export function mcpRequest(
  token: string | null,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

export type ToolAnswer = {
  isError?: boolean;
  content: { type: string; text: string }[];
  // The tools' JSON answers, read loosely in tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredContent: any;
};

export async function rpc(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  { modern = false } = {},
) {
  const response = await mcpRequest(
    token,
    {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: modern ? { ...params, _meta: MODERN_META } : params,
    },
    modern
      ? {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": method,
          ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
        }
      : {},
  );
  return { status: response.status, body: await response.json() };
}

/** Calls a tool and returns its answer (`isError` for a refused input). */
export async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolAnswer> {
  const { status, body } = await rpc(token, "tools/call", { name, arguments: args });
  if (status !== 200 || !body.result) {
    throw new Error(`tools/call ${name}: HTTP ${status} ${JSON.stringify(body)}`);
  }
  return body.result as ToolAnswer;
}
