import type { MembershipRole } from "./schema";

/**
 * Who is asking, and for which workspace (D-25). Built server-side from the session by
 * `getAccessContext()` in src/server/auth; every scoped data-access function takes it as its
 * first argument and filters by it.
 */
export type AccessContext = {
  user: { id: string; email: string; name: string };
  workspace: { id: number; name: string };
  role: MembershipRole;
};
