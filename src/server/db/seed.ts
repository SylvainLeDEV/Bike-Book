import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { accounts, memberships, users, workspaces } from "./schema";

/** Fictitious demo account for local development (D-22: never real data). */
export const DEMO_ACCOUNT = {
  name: "Camille Martin",
  email: "demo@example.com",
  password: "demo-password-123",
  workspaceName: "Garage de démo",
} as const;

export type SeedResult = { created: boolean; email: string };

/**
 * Creates the demo user, their credential account, workspace and owner membership.
 * Idempotent: does nothing if the demo user already exists.
 */
export async function seedDemoData(): Promise<SeedResult> {
  const db = getDb();
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_ACCOUNT.email))
    .get();
  if (existing) return { created: false, email: DEMO_ACCOUNT.email };

  // Same password format as Better Auth's own sign-up (credential account, scrypt hash).
  const passwordHash = await hashPassword(DEMO_ACCOUNT.password);
  const userId = randomUUID();

  db.transaction((tx) => {
    tx.insert(users)
      .values({ id: userId, name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email })
      .run();
    tx.insert(accounts)
      .values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: passwordHash,
      })
      .run();
    const workspace = tx
      .insert(workspaces)
      .values({ name: DEMO_ACCOUNT.workspaceName })
      .returning({ id: workspaces.id })
      .get();
    tx.insert(memberships).values({ userId, workspaceId: workspace.id, role: "owner" }).run();
  });

  return { created: true, email: DEMO_ACCOUNT.email };
}
