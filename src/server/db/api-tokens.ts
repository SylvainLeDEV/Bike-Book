import "server-only";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import { apiTokens, memberships, users, workspaces } from "./schema";

// Personal access tokens (D-90). The token itself never reaches this layer: only its SHA-256
// hash (src/server/auth/tokens.ts makes both). A token belongs to one user in one workspace.

export type ApiToken = {
  id: number;
  name: string;
  /** The token's first characters, to recognise it in the list. */
  tokenStart: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/** Records a new token of the current user in the current workspace. */
export function createApiToken(
  ctx: AccessContext,
  data: { name: string; tokenHash: string; tokenStart: string },
): { tokenId: number } {
  const { id } = getDb()
    .insert(apiTokens)
    .values({ ...data, userId: ctx.user.id, workspaceId: ctx.workspace.id })
    .returning({ id: apiTokens.id })
    .get();
  return { tokenId: id };
}

/** The current user's tokens in the current workspace that still work, newest first. */
export function listApiTokens(ctx: AccessContext): ApiToken[] {
  return getDb()
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenStart: apiTokens.tokenStart,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.userId, ctx.user.id),
        eq(apiTokens.workspaceId, ctx.workspace.id),
        isNull(apiTokens.revokedAt),
      ),
    )
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id))
    .all();
}

/**
 * Revokes one of the current user's tokens: it never authenticates again. The row stays, so the
 * server logs that name its id keep a meaning. False when unknown, another user's or revoked.
 */
export function revokeApiToken(ctx: AccessContext, tokenId: number, now = new Date()): boolean {
  const result = getDb()
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, ctx.user.id),
        eq(apiTokens.workspaceId, ctx.workspace.id),
        isNull(apiTokens.revokedAt),
      ),
    )
    .run();
  return result.changes > 0;
}

/**
 * The access context a token hash stands for, or null: unknown, revoked, or its user is no
 * longer a member of the token's workspace. Records the use (`last_used_at`).
 */
export function findTokenAccess(tokenHash: string, now = new Date()): AccessContext | null {
  return tokenAccess(eq(apiTokens.tokenHash, tokenHash), now);
}

/**
 * The same, by the token's id: an upload link carries the id of the token that asked for it, so
 * the link stops working once that token is revoked (D-99).
 */
export function findTokenAccessById(tokenId: number, now = new Date()): AccessContext | null {
  return tokenAccess(eq(apiTokens.id, tokenId), now);
}

function tokenAccess(which: SQL, now: Date): AccessContext | null {
  const row = getDb()
    .select({
      tokenId: apiTokens.id,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: memberships.role,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .innerJoin(workspaces, eq(workspaces.id, apiTokens.workspaceId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, apiTokens.userId),
        eq(memberships.workspaceId, apiTokens.workspaceId),
      ),
    )
    .where(and(which, isNull(apiTokens.revokedAt)))
    .get();
  if (!row) return null;
  getDb().update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.tokenId)).run();
  return {
    user: { id: row.userId, email: row.userEmail, name: row.userName },
    workspace: { id: row.workspaceId, name: row.workspaceName },
    role: row.role,
    tokenId: row.tokenId,
  };
}
