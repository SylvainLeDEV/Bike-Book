import {
  Bike,
  CableCar,
  ChevronsDownUp,
  CircleCheck,
  CircleDot,
  Clock,
  Disc,
  Droplet,
  Link,
  type LucideIcon,
  Mountain,
  OctagonAlert,
  Package,
  PackageMinus,
  Pause,
  Route,
  ShoppingCart,
  SprayCan,
  Trees,
  Truck,
  Wrench,
  Zap,
  Gauge,
} from "lucide-react";
import type {
  InventoryCategory,
  InventoryKind,
  RebuyState,
  RideType,
  RuleStatus,
} from "@/lib/view-models";

/** One icon per component group and workshop category (the mockup's choices). */
export const CATEGORY_ICONS: Record<InventoryCategory, LucideIcon> = {
  suspension: ChevronsDownUp,
  drivetrain: Link,
  brakes: Disc,
  wheels: CircleDot,
  cockpit: Gauge,
  frame: Bike,
  electric: Zap,
  care: SprayCan,
  other: Wrench,
};

export const RIDE_TYPE_ICONS: Record<RideType, LucideIcon> = {
  road: Route,
  gravel: Route,
  xc: Mountain,
  trail: Trees,
  enduro: Mountain,
  dh: Mountain,
  bike_park: CableCar,
  commute: Bike,
  indoor: Bike,
  other: Bike,
};

export const RULE_STATUS_ICONS: Record<RuleStatus, LucideIcon> = {
  ok: CircleCheck,
  due_soon: Clock,
  overdue: OctagonAlert,
  snoozed: Pause,
};

export const REBUY_STATE_ICONS: Record<RebuyState, LucideIcon> = {
  to_order: ShoppingCart,
  ordered: Truck,
  low_stock: PackageMinus,
};

/** A workshop item's kind (the mockup's choices): part, product, tool. */
export const KIND_ICONS: Record<InventoryKind, LucideIcon> = {
  part: Package,
  product: Droplet,
  tool: Wrench,
};
