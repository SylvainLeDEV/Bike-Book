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

/** Where a ride comes from: typed by hand, or imported from Garmin (phase 2). */
export const RIDE_SOURCES = ["manual", "garmin_api", "file_import"] as const;
export type RideSource = (typeof RIDE_SOURCES)[number];

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

/**
 * Codes of the built-in component types (reference data, rows of `component_types` created by
 * migration 0003). Listed here so that every code has a French label (labels.ts); a new type
 * needs a data migration and an entry here.
 */
export const COMPONENT_TYPE_CODES = [
  "fork",
  "rear_shock",
  "chain",
  "cassette",
  "chainring",
  "crankset",
  "bottom_bracket",
  "rear_derailleur",
  "shifter",
  "pedals",
  "brake",
  "brake_pads",
  "rotor",
  "wheel",
  "tire",
  "hub_bearings",
  "handlebar",
  "stem",
  "grips",
  "saddle",
  "dropper_post",
  "frame",
  "headset",
  "frame_bearings",
  "motor",
  "battery",
  "display",
  "other",
] as const;
export type ComponentTypeCode = (typeof COMPONENT_TYPE_CODES)[number];

/** Where a rule template's interval comes from. */
export const TEMPLATE_SOURCES = ["manufacturer", "common_practice", "personal"] as const;
export type TemplateSource = (typeof TEMPLATE_SOURCES)[number];

/** How far the interval can be trusted (labels of the docs: Verified, Secondary…). */
export const EVIDENCE_LEVELS = ["verified", "secondary", "unverified", "estimate"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const COMPONENT_POSITIONS = ["front", "rear", "none"] as const;
export type ComponentPosition = (typeof COMPONENT_POSITIONS)[number];

/** `stock`: part of the bike as bought; `replacement`: replaced a worn or broken part;
 * `upgrade`: replaced a part to improve it, or added later. */
export const COMPONENT_ORIGINS = ["stock", "replacement", "upgrade"] as const;
export type ComponentOrigin = (typeof COMPONENT_ORIGINS)[number];

export const MAINTENANCE_ACTIONS = [
  "replaced",
  "serviced",
  "inspected",
  "adjusted",
  "cleaned",
  "lubricated",
  "bled",
  "trued",
  "other",
] as const;
export type MaintenanceAction = (typeof MAINTENANCE_ACTIONS)[number];

/** The actions of the maintenance sheet: replacements go through "Remplacer une pièce" (D-63). */
export const MAINTENANCE_LINE_ACTIONS = [
  "serviced",
  "inspected",
  "adjusted",
  "cleaned",
  "lubricated",
  "bled",
  "trued",
  "other",
] as const satisfies readonly MaintenanceAction[];

/** Unit of a measurement taken during maintenance (chain stretch, pad thickness). */
export const MEASUREMENT_UNITS = ["percent", "mm"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

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

/** One-off to-dos (D-34): to do, done, or dropped. */
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** What a workshop item is (D-33): all three kinds exist from phase 1, the UI offers parts. */
export const INVENTORY_KINDS = ["part", "product", "tool"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

/** Level of a product's open container (D-36, phase 1.5). */
export const PRODUCT_LEVELS = ["full", "started", "low", "empty"] as const;
export type ProductLevel = (typeof PRODUCT_LEVELS)[number];

export const INVENTORY_UNITS = ["piece", "pair", "set"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const RESTOCK_STATUSES = ["none", "to_order", "ordered"] as const;
export type RestockStatus = (typeof RESTOCK_STATUSES)[number];

export const MOVEMENT_KINDS = ["initial", "purchase", "use", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MAINTENANCE_PERFORMERS = ["self", "shop"] as const;
export type MaintenancePerformer = (typeof MAINTENANCE_PERFORMERS)[number];
