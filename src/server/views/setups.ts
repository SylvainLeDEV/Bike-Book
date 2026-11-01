import "server-only";
import { DAMPER_ADJUSTERS, SUSPENSION_TYPE_CODES, type SuspensionTypeCode } from "@/lib/enums";
import { DAMPER_ADJUSTER_LABELS } from "@/lib/labels";
import {
  formatBar,
  formatClicks,
  formatMillimetres,
  formatPsi,
  formatSpringRate,
  isSuspensionType,
} from "@/lib/setup";
import { formatInteger, withUnit } from "@/lib/format";
import { decimalText } from "@/lib/parse";
import type {
  SetupChangeVM,
  SetupInput,
  SetupTabVM,
  SuspensionSpecsInput,
  SuspensionUnitVM,
} from "@/lib/view-models";
import type { Component, Setup, SuspensionSpecs } from "@/server/db";
import { setupChanges, type SetupFieldKey } from "@/server/domain/setups";

// The bike page's "Réglages" tab (D-79): the fitted fork and rear shock with their specs, and the
// setup log with what each setup changed.

const FIELD_LABELS: Record<SetupFieldKey, string> = {
  airPressurePsi: "Pression",
  springRateLbPerIn: "Ressort",
  volumeSpacers: "Tokens",
  sagMm: "SAG",
  sagTargetPercent: "SAG visé",
  tireFrontPressureBar: "Avant",
  tireRearPressureBar: "Arrière",
  ...(Object.fromEntries(
    DAMPER_ADJUSTERS.map((a) => [a, DAMPER_ADJUSTER_LABELS[a].short]),
  ) as Record<(typeof DAMPER_ADJUSTERS)[number], string>),
};

function formatValue(field: SetupFieldKey, value: number): string {
  switch (field) {
    case "airPressurePsi":
      return formatPsi(value);
    case "springRateLbPerIn":
      return formatSpringRate(value);
    case "volumeSpacers":
      return formatInteger(value);
    case "sagMm":
      return formatMillimetres(value);
    case "sagTargetPercent":
      return withUnit(decimalText(value, 1), "%");
    case "tireFrontPressureBar":
    case "tireRearPressureBar":
      return formatBar(value);
    default:
      return formatClicks(value);
  }
}

/** "RockShox Lyrik Ultimate": brand and model, without the travel shown beside it. */
function partName(component: Component): string {
  return [component.brand, component.model].filter(Boolean).join(" ") || "Modèle non renseigné";
}

export function toSpecsInput(specs: SuspensionSpecs | undefined): SuspensionSpecsInput | null {
  return specs
    ? {
        springType: specs.springType,
        travelMm: specs.travelMm,
        wheelTravelMm: specs.wheelTravelMm,
        maxClicks: { ...specs.maxClicks },
      }
    : null;
}

function toInput({
  setOn,
  label,
  notes,
  tireFrontPressureBar,
  tireRearPressureBar,
  suspensions,
}: Setup): SetupInput {
  return { setOn, label, notes, tireFrontPressureBar, tireRearPressureBar, suspensions };
}

export function setupTab(
  components: Component[],
  specs: SuspensionSpecs[],
  setups: Setup[],
  /**
   * A mountain bike's fork is a suspension fork unless told otherwise (D-83): it gets its view even
   * before it is described. On other bikes, a fork without specs is rigid.
   */
  suspensionByDefault: boolean,
): SetupTabVM {
  const specsById = new Map(specs.map((s) => [s.componentId, s]));
  const byId = new Map(components.map((c) => [c.id, c]));
  const fitted = (typeCode: SuspensionTypeCode) =>
    components.find((c) => c.typeCode === typeCode && c.removedAt == null) ?? null;
  const fork = fitted("fork");
  const shock = fitted("rear_shock");

  const units: SuspensionUnitVM[] = [];
  if (fork && (specsById.has(fork.id) || suspensionByDefault)) {
    units.push({
      componentId: fork.id,
      typeCode: "fork",
      name: partName(fork),
      specs: toSpecsInput(specsById.get(fork.id)),
    });
  }
  if (shock) {
    units.push({
      componentId: shock.id,
      typeCode: "rear_shock",
      name: partName(shock),
      specs: toSpecsInput(specsById.get(shock.id)),
    });
  }

  // A setup's parts in the order of the tab: fork, then rear shock.
  const order = (componentId: number) => {
    const type = byId.get(componentId)?.typeCode;
    return type && isSuspensionType(type) ? SUSPENSION_TYPE_CODES.indexOf(type) : 2;
  };
  const entries = setups.map((setup, index) => {
    const values = toInput(setup);
    values.suspensions = [...values.suspensions].sort(
      (a, b) => order(a.componentId) - order(b.componentId),
    );
    const previous = setups[index + 1] ? toInput(setups[index + 1]) : null;
    const changes: SetupChangeVM[] = setupChanges(previous, values).flatMap((change) => {
      const type = change.componentId == null ? "tires" : byId.get(change.componentId)?.typeCode;
      if (type !== "tires" && (type == null || !isSuspensionType(type))) return [];
      return [
        {
          unit: type,
          field: FIELD_LABELS[change.field],
          from: change.from == null ? null : formatValue(change.field, change.from),
          to: change.to == null ? null : formatValue(change.field, change.to),
        },
      ];
    });
    return {
      id: setup.id,
      setOn: setup.setOn,
      label: setup.label,
      notes: setup.notes,
      values,
      changes,
      first: previous == null,
    };
  });

  return {
    units,
    rigidFork:
      fork && !specsById.has(fork.id) && !suspensionByDefault
        ? { componentId: fork.id, name: partName(fork) }
        : null,
    entries,
  };
}
