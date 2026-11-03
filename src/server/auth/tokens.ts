import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createApiToken, findTokenAccess, type AccessContext } from "@/server/db";

// Personal access tokens for an external assistant (D-90), independent of Better Auth's
// sessions. A token is `bb_` and 32 random bytes in base64url (256 bits); the database keeps its
// SHA-256 only, so a copy of the database never holds a usable token. Never log a token.

export const TOKEN_PREFIX = "bb_";
/** `bb_` + 43 base64url characters. */
const TOKEN_PATTERN = /^bb_[A-Za-z0-9_-]{43}$/;
/** How much of the token the list shows: the prefix and 5 characters (30 of 256 bits). */
const TOKEN_START_LENGTH = TOKEN_PREFIX.length + 5;

/** SHA-256 of the whole token, lowercase hex. A fast hash is enough: the token is random. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A new random token, its hash and the start shown in the list. */
export function generateToken(): { token: string; tokenHash: string; tokenStart: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashToken(token), tokenStart: token.slice(0, TOKEN_START_LENGTH) };
}

/** Creates a token for the current user and workspace; the token is returned once, here only. */
export function issueToken(
  ctx: AccessContext,
  name: string,
): { tokenId: number; token: string; tokenStart: string } {
  const { token, tokenHash, tokenStart } = generateToken();
  const { tokenId } = createApiToken(ctx, { name, tokenHash, tokenStart });
  return { tokenId, token, tokenStart };
}

/** The token of an `Authorization: Bearer …` header, when it has the token's shape. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer[ \t]+(\S+)[ \t]*$/i);
  const token = match?.[1];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * The access context of a request carrying a valid personal token, or null (no header, not a
 * token, unknown or revoked, user no longer in the workspace). Any route may accept tokens by
 * calling it; the context has the token's id (`tokenId`) and is scoped like a session's.
 */
export function authenticateBearer(request: Request): AccessContext | null {
  const token = bearerToken(request.headers.get("authorization"));
  return token ? findTokenAccess(hashToken(token)) : null;
}
