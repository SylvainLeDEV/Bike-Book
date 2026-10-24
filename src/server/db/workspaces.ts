import "server-only";
import { and, count, eq } from "drizzle-orm";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import { memberships, workspaces } from "./schema";

export type WorkspaceOverview = {
  id: number;
  name: string;
  createdAt: Date;
  memberCount: number;
};

/** The current workspace, as long as the current user is still one of its members. */
export function getWorkspaceOverview(ctx: AccessContext): WorkspaceOverview | null {
  const db = getDb();
  const workspace = db
    .select({ id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
    .where(and(eq(workspaces.id, ctx.workspace.id), eq(memberships.userId, ctx.user.id)))
    .get();
  if (!workspace) return null;
  const members = db
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspace.id))
    .get();
  return { ...workspace, memberCount: members?.value ?? 0 };
}
