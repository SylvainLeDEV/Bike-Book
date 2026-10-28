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
  updateBike,
  type Bike,
  type BikeData,
  type SaveBikeOutcome,
} from "./bikes";
export {
  listComponentTypes,
  listRuleTemplates,
  type ComponentType,
  type RuleTemplate,
} from "./reference";
export { listShops } from "./shops";
export {
  createComponent,
  getComponent,
  listComponents,
  listMaintenanceEvents,
  replaceComponent,
  undoReplacement,
  updateComponent,
  type Component,
  type ComponentData,
  type MaintenanceEvent,
  type MaintenanceItem,
  type ReplacementData,
  type ReplacementOutcome,
  type SaveComponentOutcome,
  type UndoOutcome,
} from "./components";
export {
  createRide,
  listRides,
  listRideUsages,
  deleteRide,
  updateRide,
  type Ride,
  type RideData,
  type RideEdit,
} from "./rides";
export {
  createMaintenanceEvent,
  deleteMaintenanceEvent,
  updateMaintenanceEvent,
  type CreateEventOutcome,
  type UpdateEventOutcome,
  type MaintenanceEventData,
  type MaintenanceLineData,
} from "./maintenance";
export {
  createRule,
  listRuleResets,
  listRules,
  snoozeRule,
  updateRule,
  type Rule,
  type RuleData,
} from "./rules";
export {
  createTask,
  listDoneTasks,
  listOpenTasks,
  setTaskStatus,
  updateTask,
  type Task,
  type TaskData,
} from "./tasks";
export {
  addMovement,
  addPurchaseLink,
  createItem,
  listInventory,
  receiveItem,
  setItemArchived,
  setRestock,
  undoMovement,
  undoReceive,
  updateItem,
  type InventoryItem,
  type InventoryLink,
  type InventoryMovement,
  type ItemData,
  type RestockFields,
} from "./inventory";
export {
  coverOf,
  createAttachment,
  describeOwner,
  deleteAttachment,
  getAttachment,
  listAttachments,
  listBikeAttachments,
  listItemAttachments,
  ownsAttachmentTarget,
  setAttachmentCover,
  updateAttachment,
  type Attachment,
  type AttachmentData,
  type AttachmentOwner,
  type AttachmentPatch,
  type OwnerDescription,
} from "./attachments";
export {
  exportWorkspaceTables,
  NOT_EXPORTED_TABLES,
  type ExportColumn,
  type ExportTable,
} from "./export";
