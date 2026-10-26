/**
 * Enum values of the data model, in English (D-50), each defined in docs/03-data-model.md.
 * One list per enum, shared by the database schema (CHECK constraints), the input validation
 * (Zod) and the view models. French labels live in labels.ts only.
 *
 * Client-safe on purpose; the schema imports it by relative path (drizzle-kit has no "@" alias).
 */

export const DISCIPLINES = [
  "road",
  "gravel",
  "xc",
  "trail",
  "enduro",
  "dh",
  "dirt",
  "city",
  "other",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** Bikes are never deleted, only given another status. */
export const BIKE_STATUSES = ["active", "stored", "sold", "stolen", "retired"] as const;
export type BikeStatus = (typeof BIKE_STATUSES)[number];

/** Wheel size in inches or ETRTO family; `mullet` = 29 in front, 27.5 in the rear. */
export const WHEEL_SIZES = ["29", "27.5", "26", "mullet", "700c", "650b", "other"] as const;
export type WheelSize = (typeof WHEEL_SIZES)[number];

export const SHOP_KINDS = ["physical", "online"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export const RIDE_TYPES = [
  "road",
  "gravel",
  "xc",
  "trail",
  "enduro",
  "dh",
  "bike_park",
  "commute",
  "indoor",
  "other",
] as const;
export type RideType = (typeof RIDE_TYPES)[number];

export const RIDE_CONDITIONS = ["dry", "wet", "mud", "dust", "snow", "mixed"] as const;
export type RideConditions = (typeof RIDE_CONDITIONS)[number];

export const COMPONENT_GROUPS = [
  "suspension",
  "drivetrain",
  "brakes",
  "wheels",
  "cockpit",
  "frame",
  "electric",
  "other",
] as const;
export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

/** The component groups plus `care` (cleaning, lubrication). */
export const INVENTORY_CATEGORIES = [...COMPONENT_GROUPS, "care"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const COMPONENT_POSITIONS = ["front", "rear", "none"] as const;
export type ComponentPosition = (typeof COMPONENT_POSITIONS)[number];

export const REMOVAL_REASONS = [
  "worn",
  "broken",
  "crash",
  "upgrade",
  "sold_with_bike",
  "other",
] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

/** Computed by the rule engine, never stored. */
export const RULE_STATUSES = ["ok", "due_soon", "overdue", "snoozed"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const INVENTORY_UNITS = ["piece", "pair", "set"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const RESTOCK_STATUSES = ["none", "to_order", "ordered"] as const;
export type RestockStatus = (typeof RESTOCK_STATUSES)[number];

export const MOVEMENT_KINDS = ["initial", "purchase", "use", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MAINTENANCE_PERFORMERS = ["self", "shop"] as const;
export type MaintenancePerformer = (typeof MAINTENANCE_PERFORMERS)[number];
