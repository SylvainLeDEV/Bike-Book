import "server-only";
import type {
  ComponentGroup,
  ComponentOrigin,
  ComponentPosition,
  ComponentTypeCode,
  RemovalReason,
} from "@/lib/enums";
import { componentCounter, type RideUsage, type Usage } from "./wear";

/** What the slot logic needs from a component. */
export type ComponentRecord = {
  id: number;
  typeCode: ComponentTypeCode;
  position: ComponentPosition;
  brand: string | null;
  model: string | null;
  specs: Record<string, string | number> | null;
  origin: ComponentOrigin;
  replacesComponentId: number | null;
  installedAt: number;
  removedAt: number | null;
  removalReason: RemovalReason | null;
  removalNote: string | null;
  initialDistanceM: number;
  initialWearS: number;
};

/** Suspension and motors wear by the hour; everything else by the kilometre. */
export function counterUnit(group: ComponentGroup): "duration_s" | "distance_m" {
  return group === "suspension" || group === "electric" ? "duration_s" : "distance_m";
}

/** "RockShox Lyrik Ultimate · 160 mm": brand, model and the travel when it is known. */
export function componentName(component: Pick<ComponentRecord, "brand" | "model" | "specs">) {
  const name = [component.brand, component.model].filter(Boolean).join(" ");
  const travel = component.specs?.travel_mm;
  return [name || null, travel != null ? `${travel} mm` : null].filter(Boolean).join(" · ");
}

export type SlotHistory = {
  fitted: ComponentRecord & { counter: Usage };
  /** The parts this slot had before, the original one first, each with its wear at removal. */
  lineage: (ComponentRecord & { removedAt: number; counter: Usage })[];
};

/**
 * The parts fitted today, each followed back through `replaces_component_id` to the original
 * part (D-43). Removed parts that nothing replaced (a part taken off for good) are not listed.
 */
export function fittedSlots(components: ComponentRecord[], rides: RideUsage[]): SlotHistory[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  return components
    .filter((component) => component.removedAt == null)
    .map((fitted) => {
      const lineage: SlotHistory["lineage"] = [];
      const seen = new Set<number>([fitted.id]);
      let previous =
        fitted.replacesComponentId != null ? byId.get(fitted.replacesComponentId) : undefined;
      while (previous && previous.removedAt != null && !seen.has(previous.id)) {
        seen.add(previous.id);
        lineage.unshift({
          ...previous,
          removedAt: previous.removedAt,
          counter: componentCounter(previous, rides),
        });
        previous =
          previous.replacesComponentId != null ? byId.get(previous.replacesComponentId) : undefined;
      }
      return { fitted: { ...fitted, counter: componentCounter(fitted, rides) }, lineage };
    });
}

/**
 * The fitted part that already occupies this slot, if the type allows only one (checked by the
 * app, docs/03 `single_slot`).
 */
export function occupiedSlot<
  T extends Pick<ComponentRecord, "id" | "typeCode" | "position" | "removedAt">,
>(
  components: T[],
  slot: { typeCode: ComponentTypeCode; position: ComponentPosition; singleSlot: boolean },
  exceptId?: number,
): T | undefined {
  if (!slot.singleSlot) return undefined;
  return components.find(
    (component) =>
      component.removedAt == null &&
      component.id !== exceptId &&
      component.typeCode === slot.typeCode &&
      component.position === slot.position,
  );
}

/** The origin of the part fitted by a replacement: an upgrade when that was the reason. */
export function replacementOrigin(reason: RemovalReason): ComponentOrigin {
  return reason === "upgrade" ? "upgrade" : "replacement";
}
