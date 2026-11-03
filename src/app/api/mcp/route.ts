import { authenticateBearer } from "@/server/auth/tokens";
import { handleMcpRequest } from "@/server/mcp/http";

/*
 * POST /api/mcp: the MCP server for an external assistant (D-90), stateless, JSON answers. Only
 * a personal token (`Authorization: Bearer bb_…`, created in Paramètres) opens it; Better Auth's
 * session cookie does not. Other methods answer 405 (no session, no SSE stream).
 */

function unauthorized() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "A valid personal token is required (Paramètres)." },
      id: null,
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="bike-book"', "Cache-Control": "no-store" },
    },
  );
}

async function serve(request: Request): Promise<Response> {
  const ctx = authenticateBearer(request);
  if (!ctx) return unauthorized();
  return handleMcpRequest(request, ctx);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
