import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import { memberships, users, workspaces } from "./schema";

// Unscoped queries, needed before a user and workspace are known: first-launch setup, session
// resolution and health checks. Everything else takes an AccessContext.

export function countUsers(): number {
  const row = getDb().select({ value: count() }).from(users).get();
  return row?.value ?? 0;
}

/**
 * Resolves the access context of a signed-in user: their first workspace, by membership date.
 * Returns null when the user has no workspace (which the setup flow prevents).
 */
export function findAccessContext(user: AccessContext["user"]): AccessContext | null {
  const row = getDb()
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(memberships.createdAt), asc(workspaces.id))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: row.workspaceId, name: row.workspaceName },
    role: row.role,
  };
}

/** Creates a workspace and makes the user its owner, in one transaction. */
export function createWorkspaceWithOwner(input: { userId: string; workspaceName: string }) {
  return getDb().transaction((tx) => {
    const workspace = tx
      .insert(workspaces)
      .values({ name: input.workspaceName })
      .returning({ id: workspaces.id, name: workspaces.name })
      .get();
    tx.insert(memberships)
      .values({ userId: input.userId, workspaceId: workspace.id, role: "owner" })
      .run();
    return workspace;
  });
}

/** Throws if the database cannot be read. Used by /api/healthz. */
export function checkDatabase(): void {
  getDb().get(sql`select 1`);
}
