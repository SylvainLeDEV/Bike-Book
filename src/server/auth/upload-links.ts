import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ATTACHMENT_OWNERS } from "@/lib/enums";
import { findTokenAccessById, type AccessContext, type AttachmentOwner } from "@/server/db";
import { getEnv } from "@/server/env";

// Upload links (D-99): an assistant working with the owner's personal token (D-90) sends a file
// to one element, from the owner's computer, without ever handling the token itself. The MCP's
// get_upload_link answers a URL of /api/uploads and a signed link, sent in the `X-Upload-Link`
// header (never in the URL, which access logs keep): the element, the token that asked for it,
// and its expiry, signed with an HMAC key derived from AUTH_SECRET. Nothing is
// stored: a link works for that element until it expires, and stops at once when its token is
// revoked. Files never travel through the MCP itself.

/** How long a link works: long enough to send a few files, short enough not to linger. */
export const UPLOAD_LINK_TTL_MS = 15 * 60 * 1000;

const payloadSchema = z.object({
  /** The personal token that asked for the link. */
  t: z.number().int().positive(),
  /** The element's kind and id. */
  k: z.enum(ATTACHMENT_OWNERS),
  i: z.number().int().positive(),
  /** Expiry, epoch milliseconds. */
  e: z.number().int().positive(),
});

/** A key of its own, derived from AUTH_SECRET: a link's signature is never a session's. */
function signingKey(): Buffer {
  return createHmac("sha256", getEnv().authSecret).update("bike-book upload link v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** A link for one element, asked for with a personal token (the MCP's context has its id). */
export function createUploadLink(
  ctx: AccessContext,
  owner: AttachmentOwner,
  options: { asCover?: boolean; now?: number } = {},
): { url: string; link: string; expiresAt: number } {
  if (ctx.tokenId == null) throw new Error("An upload link needs a personal token");
  const expiresAt = (options.now ?? Date.now()) + UPLOAD_LINK_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ t: ctx.tokenId, k: owner.kind, i: owner.id, e: expiresAt }),
  ).toString("base64url");
  const params = new URLSearchParams({ owner: owner.kind, id: String(owner.id) });
  if (options.asCover) params.set("cover", "1");
  return {
    url: `${getEnv().publicUrl}/api/uploads?${params}`,
    link: `${payload}.${sign(payload)}`,
    expiresAt,
  };
}

/**
 * The access context of a request carrying a valid link for that element, or null: a bad
 * signature, another element, expired, or its token revoked.
 */
export function authenticateUploadLink(
  link: string,
  owner: AttachmentOwner,
  now = Date.now(),
): AccessContext | null {
  const [payload, signature, extra] = link.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return null;
  const { t, k, i, e } = parsed.data;
  if (e <= now || k !== owner.kind || i !== owner.id) return null;
  return findTokenAccessById(t);
}
