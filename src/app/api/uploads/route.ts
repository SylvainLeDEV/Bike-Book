import * as z from "zod";
import { ATTACHMENT_OWNERS } from "@/lib/enums";
import { MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES, type UploadErrorCode } from "@/lib/uploads";
import { getAccessContext } from "@/server/auth/context";
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
  const ctx = await getAccessContext();
  if (!ctx) return refuse("signed_out");
  const params = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
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
  return Response.json(
    { id: outcome.attachment.id },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
