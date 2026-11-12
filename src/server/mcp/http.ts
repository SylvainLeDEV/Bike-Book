import "server-only";
import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import type { AccessContext } from "@/server/db";
import { createMcpServer } from "./server";

/*
 * The MCP endpoint's HTTP side (D-90): stateless, JSON answers only (no SSE), one server per
 * request bound to the token's access context. The SDK (v2) serves the 2026-07-28 protocol;
 * clients of the 2025 revisions go to a stateless transport set to answer in JSON too (the
 * SDK's own fallback would answer them in SSE).
 */

/** Files never travel through the MCP: about 1 MB is plenty for JSON (D-90). */
export const MAX_MCP_BODY_BYTES = 1024 * 1024;

function jsonRpcError(status: number, code: number, message: string, headers?: HeadersInit) {
  return Response.json(
    { jsonrpc: "2.0", error: { code, message }, id: null },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

function onError(error: Error) {
  console.error("MCP:", error.message);
}

/** Each request's access context, read back by the factory from the request it is given. */
const contexts = new WeakMap<Request, AccessContext>();

let modernHandler: McpHttpHandler | undefined;

/*
 * The 2026-07-28 handler, created once per process: `createMcpHandler` warns on stdout each
 * time it is built with `responseMode: "json"` (04, pitfall 16). It still asks the factory
 * for a new server per request; the factory finds that request's access context through
 * `requestInfo`, the request handed to `fetch`. No `subscriptions/listen` stream either
 * (`maxSubscriptions: 0`): nothing is ever published, and a shared handler would keep them open.
 */
function getModernHandler(): McpHttpHandler {
  modernHandler ??= createMcpHandler(
    ({ requestInfo }) => {
      const ctx = requestInfo && contexts.get(requestInfo);
      if (!ctx) throw new Error("MCP request without an access context");
      return createMcpServer(ctx);
    },
    {
      legacy: "reject",
      responseMode: "json",
      maxSubscriptions: 0,
      maxRequestBodySize: MAX_MCP_BODY_BYTES,
      onerror: onError,
    },
  );
  return modernHandler;
}

/** Serves one MCP request for an authenticated caller. */
export async function handleMcpRequest(request: Request, ctx: AccessContext): Promise<Response> {
  if (request.method !== "POST") {
    return jsonRpcError(405, -32000, "Method not allowed: this server is stateless.", {
      Allow: "POST",
    });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_MCP_BODY_BYTES) {
    return jsonRpcError(413, -32000, "Request body too large (1 MB at most).");
  }

  if (await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_MCP_BODY_BYTES })) {
    const server = createMcpServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_MCP_BODY_BYTES,
    });
    transport.onerror = onError;
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await transport.close();
      await server.close();
    }
  }

  contexts.set(request, ctx);
  try {
    return await getModernHandler().fetch(request);
  } finally {
    contexts.delete(request);
  }
}
