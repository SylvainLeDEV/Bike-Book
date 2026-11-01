import "server-only";
import { DAMPER_ADJUSTERS } from "@/lib/enums";
import { valuesOf, type SuspensionField } from "@/lib/setup";
import type { SetupInput } from "@/lib/view-models";

// The setup log (D-24, D-79): what each setup changed from the one before it. Pure.

export type SetupFieldKey = "tireFrontPressureBar" | "tireRearPressureBar" | SuspensionField;

export type SetupChange = {
  /** The part whose value changed; null for the tyres. */
  componentId: number | null;
  field: SetupFieldKey;
  from: number | null;
  to: number | null;
};

const SUSPENSION_FIELDS = [
  "airPressurePsi",
  "springRateLbPerIn",
  "volumeSpacers",
  "sagMm",
] as const;

/**
 * The values that differ between a setup and the one before it, part by part (in the setup's
 * order), then the tyres. A part the previous setup did not have (a new fork) lists every value
 * given. Without a previous setup, every value given is listed. A value cleared shows `to: null`.
 */
export function setupChanges(previous: SetupInput | null, entry: SetupInput): SetupChange[] {
  const changes: SetupChange[] = [];
  const push = (
    componentId: number | null,
    field: SetupFieldKey,
    from: number | null,
    to: number | null,
  ) => {
    if (from !== to) changes.push({ componentId, field, from, to });
  };
  for (const values of entry.suspensions) {
    const before = valuesOf(previous, values.componentId);
    for (const field of SUSPENSION_FIELDS) {
      push(values.componentId, field, before?.[field] ?? null, values[field]);
    }
    for (const adjuster of DAMPER_ADJUSTERS) {
      push(values.componentId, adjuster, before?.clicks[adjuster] ?? null, values.clicks[adjuster]);
    }
  }
  push(
    null,
    "tireFrontPressureBar",
    previous?.tireFrontPressureBar ?? null,
    entry.tireFrontPressureBar,
  );
  push(
    null,
    "tireRearPressureBar",
    previous?.tireRearPressureBar ?? null,
    entry.tireRearPressureBar,
  );
  return changes;
}
