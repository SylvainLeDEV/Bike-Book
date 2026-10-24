import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { findAccessContext, type AccessContext } from "@/server/db";
import { getAuth } from "./auth";

/** The signed-in user's session, or null. Deduplicated within a request. */
export const getSession = cache(async () => {
  // Request-time only: keeps configuration and database access out of `next build`, and lets
  // Better Auth compare the session expiry with the clock.
  await connection();
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

/**
 * The current user and workspace, or null when signed out. Throws if a signed-in user has no
 * workspace: the setup flow always creates one, so that would be a bug, not a login problem.
 */
export const getAccessContext = cache(async (): Promise<AccessContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const context = findAccessContext(session.user);
  if (!context) {
    throw new Error(`User ${session.user.id} has no workspace`);
  }
  return context;
});

/** For protected pages and actions: the access context, or a redirect to the login page. */
export async function requireAccessContext(): Promise<AccessContext> {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  return context;
}
