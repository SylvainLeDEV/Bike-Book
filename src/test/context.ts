import { randomUUID } from "node:crypto";
import { createWorkspaceWithOwner, findAccessContext, type AccessContext } from "@/server/db";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** A user with their own workspace, as the session would resolve it (tests only). */
export function createTestContext(name: string): AccessContext {
  const user = { id: randomUUID(), name, email: `${randomUUID()}@example.com` };
  getDb().insert(users).values(user).run();
  createWorkspaceWithOwner({ userId: user.id, workspaceName: `Garage de ${name}` });
  const context = findAccessContext(user);
  if (!context) throw new Error("No workspace for the test user");
  return context;
}
