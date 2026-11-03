import type { MembershipRole } from "./schema";

/**
 * Who is asking, and for which workspace (D-25). Built server-side from the session by
 * `getAccessContext()`, or from a personal token by `authenticateBearer()` (both in
 * src/server/auth); every scoped data-access function takes it as its first argument and
 * filters by it.
 */
export type AccessContext = {
  user: { id: string; email: string; name: string };
  workspace: { id: number; name: string };
  role: MembershipRole;
  /** Set when the request came with a personal token (D-90): that token's id, for the logs. */
  tokenId?: number;
};
