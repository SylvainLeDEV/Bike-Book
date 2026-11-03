import "server-only";
import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
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
  const factory = () => createMcpServer(ctx);

  if (await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_MCP_BODY_BYTES })) {
    const server = factory();
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

  const handler = createMcpHandler(factory, {
    legacy: "reject",
    responseMode: "json",
    maxRequestBodySize: MAX_MCP_BODY_BYTES,
    onerror: onError,
  });
  try {
    return await handler.fetch(request);
  } finally {
    await handler.close();
  }
}
