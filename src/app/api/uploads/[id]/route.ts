import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getAccessContext } from "@/server/auth/context";
import { getAttachment } from "@/server/db";
import { DERIVED_SIZES, derivedFile, isDerivedSize } from "@/server/files/images";
import { dataPath } from "@/server/files/storage";

/*
 * GET /api/uploads/<id> (feature 10): an attachment of the current workspace only (D-25).
 *   ?size=thumb|display  a photo's copy, upright and without metadata (D-72), made if missing
 *   ?download=1          the original as a download (the original keeps its EXIF, GPS included)
 *   (nothing)            the original inline: images, and PDFs in the browser's own viewer
 * Always `nosniff`, and privately cached with revalidation: the ETag is the file's SHA-256, so a
 * 304 is cheap and the access is checked again every time.
 */

function contentDisposition(type: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // RFC 5987: ' ( ) * are not allowed unescaped in an extended value.
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-cache",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/api/uploads/[id]">) {
  const access = await getAccessContext();
  if (!access) return new Response("Connexion requise.", { status: 401, headers: HEADERS });
  const { id: raw } = await ctx.params;
  const id = /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null;
  const attachment = id == null ? null : getAttachment(access, id);
  if (!attachment) return new Response("Introuvable.", { status: 404, headers: HEADERS });

  const search = request.nextUrl.searchParams;
  const size = search.get("size");
  const isImage = attachment.mimeType.startsWith("image/");
  if (size != null && (!isDerivedSize(size) || !isImage)) {
    return new Response("Taille inconnue.", { status: 400, headers: HEADERS });
  }

  // A copy's ETag names its file: a new kind of copy (D-103) is never answered by a 304 for the
  // old one a browser kept.
  const copy = size ? `-${DERIVED_SIZES[size].file.replace(/\.webp$/, "")}` : "";
  const etag = `"${attachment.sha256.slice(0, 32)}${copy}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...HEADERS, ETag: etag } });
  }

  const file = size
    ? await derivedFile(attachment.storagePath, size)
    : dataPath(attachment.storagePath);
  const { size: length } = await stat(file);
  const download = search.get("download") === "1";
  const name = size
    ? attachment.originalName.replace(/\.[^.]*$/, "") + ".webp"
    : attachment.originalName;
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
    headers: {
      ...HEADERS,
      ETag: etag,
      "Content-Type": size ? "image/webp" : attachment.mimeType,
      "Content-Length": String(length),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", name),
    },
  });
}
