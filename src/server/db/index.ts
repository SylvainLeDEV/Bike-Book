/**
 * Data-access layer (D-25). Pages, Server Actions and Route Handlers import from here only:
 * the database client and schema stay private to src/server/db (enforced by ESLint).
 */
export type { AccessContext } from "./access-context";
export { checkDatabase, countUsers, createWorkspaceWithOwner, findAccessContext } from "./accounts";
export { createAuthAdapter } from "./auth-adapter";
export { initDatabase } from "./client";
export { getWorkspaceOverview, type WorkspaceOverview } from "./workspaces";
export {
  createBike,
  getBike,
  listBikes,
  listShops,
  updateBike,
  type Bike,
  type BikeData,
  type SaveBikeOutcome,
} from "./bikes";
