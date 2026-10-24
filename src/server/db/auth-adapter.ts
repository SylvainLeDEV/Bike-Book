import "server-only";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./client";
import { authSchema } from "./schema";

/**
 * Database adapter for Better Auth. The auth library manages its own tables (users, sessions,
 * accounts, verifications); application code never queries them directly.
 */
export function createAuthAdapter() {
  return drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema: authSchema,
    usePlural: true,
    // better-sqlite3 transactions are synchronous and cannot wrap Better Auth's async calls.
    transaction: false,
  });
}
