import * as z from "zod";
import { ATTACHMENT_OWNERS } from "@/lib/enums";
import { MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES, type UploadErrorCode } from "@/lib/uploads";
import { getAccessContext } from "@/server/auth/context";
import { authenticateUploadLink } from "@/server/auth/upload-links";
import { getEnv } from "@/server/env";
import { storeUpload } from "@/server/files/upload";

/*
 * POST /api/uploads (feature 10): one file per request, its bytes as the raw body (no
 * multipart), so it streams to disk and the browser shows each file's progress. Never a Server
 * Action: their body is capped (04, pitfall 2). The element and the file's details travel in
 * the query and one header:
 *   ?owner=<bike|component|maintenance_event|ride|task|inventory_item>&id=<n>
 *   &lastModified=<File.lastModified>&cover=1 (optional)
 *   X-File-Name: <encodeURIComponent(file.name)>
 * Without a session, a signed upload link for that element in `X-Upload-Link` (D-99) stands for
 * it: the MCP's get_upload_link answers one, so an assistant sends a file without handling a
 * token. A header, never the URL: access logs keep URLs. A link that does not authenticate
 * (expired, its token revoked, another element, tampered) answers `link_invalid`, not
 * `signed_out`, so the assistant asks for a new one rather than for a sign-in (D-100).
 */

const query = z.object({
  owner: z.enum(ATTACHMENT_OWNERS),
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  lastModified: z.coerce.number().int().nonnegative().optional(),
  cover: z.literal("1").optional(),
});

const STATUS: Record<UploadErrorCode, number> = {
  too_large: 413,
  heic: 415,
  unsupported: 415,
  unreadable: 415,
  empty: 400,
  aborted: 400,
  not_found: 404,
  signed_out: 401,
  link_invalid: 401,
  invalid: 400,
};

function refuse(code: UploadErrorCode) {
  return Response.json(
    { error: code, message: UPLOAD_ERROR_MESSAGES[code] },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}

function fileName(header: string | null): string | null {
  if (!header) return null;
  try {
    return decodeURIComponent(header);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const params = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const link = request.headers.get("x-upload-link")?.slice(0, 1000);
  const ctx =
    (await getAccessContext()) ??
    (params.success && link
      ? authenticateUploadLink(link, { kind: params.data.owner, id: params.data.id })
      : null);
  if (!ctx) return refuse(!link ? "signed_out" : params.success ? "link_invalid" : "invalid");
  if (!params.success || !request.body) return refuse("invalid");
  // A declared size over the limit is refused before reading; the stream is checked anyway.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    return refuse("too_large");
  }

  const outcome = await storeUpload(ctx, {
    owner: { kind: params.data.owner, id: params.data.id },
    body: request.body,
    name: fileName(request.headers.get("x-file-name")),
    lastModified: params.data.lastModified ?? null,
    asCover: params.data.cover === "1",
    timeZone: getEnv().timeZone,
  });
  if (!outcome.ok) return refuse(outcome.code);
  // A file sent with an upload link is an assistant's write: one log line, as the MCP's (D-90).
  if (ctx.tokenId != null) {
    console.info(
      JSON.stringify({
        event: "mcp_upload",
        workspace_id: ctx.workspace.id,
        token_id: ctx.tokenId,
        attachment_id: outcome.attachment.id,
      }),
    );
  }
  return Response.json(
    { id: outcome.attachment.id },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
