import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "@/server/db/client";
import { listApiTokens, revokeApiToken } from "@/server/db";
import { apiTokens, memberships } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import {
  authenticateBearer,
  bearerToken,
  generateToken,
  hashToken,
  issueToken,
  TOKEN_PREFIX,
} from "./tokens";

const requestWith = (authorization?: string) =>
  new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("personal tokens (D-90)", () => {
  it("makes random prefixed tokens and stores only their SHA-256", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).toMatch(/^bb_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // A known SHA-256 vector, so the stored format never changes by accident.
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(a.tokenStart).toBe(a.token.slice(0, TOKEN_PREFIX.length + 5));

    const ctx = createTestContext("Hashing");
    const issued = issueToken(ctx, "Mac");
    const row = getDb().select().from(apiTokens).where(eq(apiTokens.id, issued.tokenId)).get();
    expect(row?.tokenHash).toBe(hashToken(issued.token));
    expect(JSON.stringify(row)).not.toContain(issued.token);
  });

  it("reads the token of a Bearer header only when it has the token's shape", () => {
    const { token } = generateToken();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer   ${token} `)).toBe(token);
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(token)).toBeNull();
    expect(bearerToken(`Basic ${token}`)).toBeNull();
    expect(bearerToken("Bearer bb_short")).toBeNull();
    expect(bearerToken(`Bearer ${token} extra`)).toBeNull();
  });

  it("authenticates a valid token as its user and workspace, and records its use", () => {
    const ctx = createTestContext("Valid");
    const { token, tokenId } = issueToken(ctx, "Claude Code");
    expect(listApiTokens(ctx)[0]?.lastUsedAt).toBeNull();

    const access = authenticateBearer(requestWith(`Bearer ${token}`));
    expect(access).toEqual({ ...ctx, tokenId });
    expect(listApiTokens(ctx)[0]?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("refuses a missing, malformed or unknown token", () => {
    expect(authenticateBearer(requestWith())).toBeNull();
    expect(authenticateBearer(requestWith("Bearer nope"))).toBeNull();
    expect(authenticateBearer(requestWith(`Bearer ${generateToken().token}`))).toBeNull();
  });

  it("revokes a token for good, and only the owner can revoke it", () => {
    const ctx = createTestContext("Revoke");
    const other = createTestContext("Stranger");
    const { token, tokenId } = issueToken(ctx, "Mac");
    issueToken(ctx, "iPad");

    expect(revokeApiToken(other, tokenId)).toBe(false);
    expect(authenticateBearer(requestWith(`Bearer ${token}`))).not.toBeNull();

    expect(revokeApiToken(ctx, tokenId)).toBe(true);
    expect(revokeApiToken(ctx, tokenId)).toBe(false);
    expect(authenticateBearer(requestWith(`Bearer ${token}`))).toBeNull();
    expect(listApiTokens(ctx).map((t) => t.name)).toEqual(["iPad"]);
    // The row stays, so the logs that name its id keep a meaning.
    expect(getDb().select().from(apiTokens).where(eq(apiTokens.id, tokenId)).get()).toBeTruthy();
  });

  it("lists only the current user's tokens of the current workspace", () => {
    const a = createTestContext("Lister A");
    const b = createTestContext("Lister B");
    issueToken(a, "Mac de A");
    issueToken(b, "Mac de B");
    expect(listApiTokens(a).map((t) => t.name)).toEqual(["Mac de A"]);
    expect(listApiTokens(b).map((t) => t.name)).toEqual(["Mac de B"]);
  });

  it("stops working once its user leaves the workspace", () => {
    const ctx = createTestContext("Leaver");
    const { token } = issueToken(ctx, "Mac");
    getDb()
      .delete(memberships)
      .where(
        and(eq(memberships.userId, ctx.user.id), eq(memberships.workspaceId, ctx.workspace.id)),
      )
      .run();
    expect(authenticateBearer(requestWith(`Bearer ${token}`))).toBeNull();
  });
});
