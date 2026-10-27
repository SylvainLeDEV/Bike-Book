import "server-only";
import { formatQuantity, slotLabel } from "@/lib/display";
import {
  COMPONENT_GROUPS,
  COMPONENT_TYPE_CODES,
  type ComponentGroup,
  type RuleStatus,
} from "@/lib/enums";
import { localDateOf } from "@/lib/format";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import type {
  ComponentFormVM,
  ComponentGroupVM,
  ComponentTypeChoice,
  ComponentVM,
  Quantity,
  ReplacePartVM,
  RuleTemplateChoice,
} from "@/lib/view-models";
import type { Component, ComponentType, RuleTemplate } from "@/server/db";
import { componentName, counterUnit, fittedSlots } from "@/server/domain/components";
import type { RideUsage, Usage } from "@/server/domain/wear";

// Components of the bike page: today's parts with their history (D-43), the edit forms, and the
// slots offered by "Remplacer une pièce".

const POSITION_ORDER = { front: 0, rear: 1, none: 2 };

function quantity(group: ComponentGroup, usage: Usage): Quantity {
  return counterUnit(group) === "duration_s"
    ? { unit: "duration_s", value: usage.wearS }
    : { unit: "distance_m", value: usage.distanceM };
}

export function componentTypeChoices(types: ComponentType[]): ComponentTypeChoice[] {
  return [...types]
    .sort((a, b) => COMPONENT_TYPE_CODES.indexOf(a.code) - COMPONENT_TYPE_CODES.indexOf(b.code))
    .map((type) => ({
      code: type.code,
      label: COMPONENT_TYPE_LABELS[type.code],
      group: type.componentGroup,
      hasPosition: type.hasPosition,
    }));
}

/** The templates of each slot type, with their interval in words. */
export function templateChoices(templates: RuleTemplate[]): RuleTemplateChoice[] {
  return templates.flatMap((template) =>
    template.componentTypeCode == null
      ? []
      : [
          {
            id: template.id,
            componentTypeCode: template.componentTypeCode,
            title: template.title,
            intervalText: [
              template.intervalDistanceM != null
                ? formatQuantity({ unit: "distance_m", value: template.intervalDistanceM })
                : null,
              template.intervalWearS != null
                ? formatQuantity({ unit: "duration_s", value: template.intervalWearS })
                : null,
              template.intervalDays != null
                ? formatQuantity({ unit: "days", value: template.intervalDays })
                : null,
            ]
              .filter(Boolean)
              .join(" ou "),
            evidenceLevel: template.evidenceLevel,
          },
        ],
  );
}

export function componentForm(component: Component, timeZone: string): ComponentFormVM {
  return {
    id: component.id,
    typeCode: component.typeCode,
    position: component.position,
    brand: component.brand,
    model: component.model,
    reference: component.reference,
    origin: component.origin,
    fromReplacement: component.replacesComponentId != null,
    installedOn: localDateOf(component.installedAt, timeZone),
    initialDistanceM: component.initialDistanceM,
    initialWearS: component.initialWearS,
    purchasedOn: component.purchasedOn,
    purchasePriceCents: component.purchasePriceCents,
    shop: component.shop ? { name: component.shop.name, kind: component.shop.kind } : null,
    warrantyEndsOn: component.warrantyEndsOn,
    notes: component.notes,
  };
}

export type BikeComponents = {
  groups: ComponentGroupVM[];
  forms: ComponentFormVM[];
  replaceSlots: ReplacePartVM["slots"];
};

export function bikeComponents(
  components: Component[],
  types: ComponentType[],
  rides: RideUsage[],
  timeZone: string,
  /** The worst status of the rules on each fitted part (feature 6). */
  statuses: Map<number, RuleStatus> = new Map(),
): BikeComponents {
  const groupOf = new Map(types.map((type) => [type.code, type.componentGroup]));
  const slots = fittedSlots(components, rides).sort(
    (a, b) =>
      COMPONENT_TYPE_CODES.indexOf(a.fitted.typeCode) -
        COMPONENT_TYPE_CODES.indexOf(b.fitted.typeCode) ||
      POSITION_ORDER[a.fitted.position] - POSITION_ORDER[b.fitted.position] ||
      a.fitted.id - b.fitted.id,
  );
  const vms = slots.map((slot) => {
    const group = groupOf.get(slot.fitted.typeCode) ?? "other";
    const fitted = slot.fitted;
    const vm: ComponentVM = {
      id: fitted.id,
      typeLabel: slotLabel(fitted.typeCode, fitted.position),
      model: componentName(fitted) || "Modèle non renseigné",
      status: statuses.get(fitted.id) ?? null,
      counter: quantity(group, fitted.counter),
      installedOn: fitted.origin === "stock" ? null : localDateOf(fitted.installedAt, timeZone),
      photos: [],
      lineage: slot.lineage.map((part) => ({
        model: componentName(part) || "Modèle non renseigné",
        removedOn: localDateOf(part.removedAt, timeZone),
        wearAtRemoval: quantity(group, part.counter),
        reason: part.removalReason ?? "other",
        note: part.removalNote,
        photos: [],
      })),
    };
    return { group, vm, fitted };
  });
  return {
    groups: COMPONENT_GROUPS.flatMap((group) => {
      const list = vms.filter((entry) => entry.group === group).map((entry) => entry.vm);
      return list.length ? [{ group, components: list }] : [];
    }),
    forms: components
      .filter((component) => component.removedAt == null)
      .map((component) => componentForm(component, timeZone)),
    replaceSlots: vms.map(({ vm, fitted }) => ({
      componentId: vm.id,
      label: vm.typeLabel,
      componentTypeCode: fitted.typeCode,
      fitted: { model: vm.model, counter: vm.counter },
    })),
  };
}
