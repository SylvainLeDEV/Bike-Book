/**
 * Suspension and tyre setup (D-24, D-79): pure helpers shared by the setup sheet, the component
 * sheet and the server (validation, view models). Client-safe.
 */
import {
  DAMPER_ADJUSTERS,
  SUSPENSION_TYPE_CODES,
  type DamperAdjuster,
  type SuspensionTypeCode,
} from "./enums";
import { NBSP, formatInteger, withUnit, type LocalDate } from "./format";
import { decimalText } from "./parse";
import type {
  ClicksInput,
  SetupFieldErrors,
  SetupInput,
  SuspensionSpecsInput,
  SuspensionUnitVM,
  SuspensionValuesInput,
} from "./view-models";

/** The fields of a part's values, as used in the error keys `<componentId>.<field>`. */
export type SuspensionField =
  "airPressurePsi" | "springRateLbPerIn" | "volumeSpacers" | "sagMm" | DamperAdjuster;

export function isSuspensionType(code: string): code is SuspensionTypeCode {
  return (SUSPENSION_TYPE_CODES as readonly string[]).includes(code);
}

export const NO_CLICKS: ClicksInput = {
  low_speed_rebound: null,
  high_speed_rebound: null,
  low_speed_compression: null,
  high_speed_compression: null,
};

/** The adjusters a part has, in display order, with their clicks from closed to open. */
export function adjustersOf(
  specs: SuspensionSpecsInput | null,
): { code: DamperAdjuster; maxClicks: number }[] {
  if (!specs) return [];
  return DAMPER_ADJUSTERS.flatMap((code) => {
    const maxClicks = specs.maxClicks[code];
    return maxClicks == null ? [] : [{ code, maxClicks }];
  });
}

/** Sag as a percentage of the part's own travel; null when either is unknown. */
export function sagPercent(sagMm: number | null, travelMm: number | null): number | null {
  if (sagMm == null || travelMm == null || travelMm <= 0) return null;
  return (sagMm / travelMm) * 100;
}

export function emptyValues(componentId: number): SuspensionValuesInput {
  return {
    componentId,
    airPressurePsi: null,
    springRateLbPerIn: null,
    volumeSpacers: null,
    sagMm: null,
    clicks: { ...NO_CLICKS },
  };
}

/** The values of a part in a setup, or null when the setup has none for it. */
export function valuesOf(
  setup: Pick<SetupInput, "suspensions"> | null,
  componentId: number,
): SuspensionValuesInput | null {
  return setup?.suspensions.find((values) => values.componentId === componentId) ?? null;
}

/** True when nothing is given for the part. */
export function isEmptyValues(values: SuspensionValuesInput): boolean {
  return (
    values.airPressurePsi == null &&
    values.springRateLbPerIn == null &&
    values.volumeSpacers == null &&
    values.sagMm == null &&
    DAMPER_ADJUSTERS.every((a) => values.clicks[a] == null)
  );
}

/**
 * The setup sheet's starting values. A new setup starts from the current one, dated today and
 * unnamed. Restoring an older setup ("Revenir à ce réglage") takes its name, tyres and the values
 * of the parts it has that are still fitted; the other fitted parts keep their current values.
 * `skipped` counts the parts of the old setup that are no longer fitted.
 */
export function setupPrefill(
  units: Pick<SuspensionUnitVM, "componentId">[],
  current: SetupInput | null,
  today: LocalDate,
  restore: SetupInput | null = null,
): { values: SetupInput; skipped: number } {
  const fitted = new Set(units.map((unit) => unit.componentId));
  const base = restore ?? current;
  const values: SetupInput = {
    setOn: today,
    label: restore?.label ?? null,
    notes: null,
    tireFrontPressureBar: base?.tireFrontPressureBar ?? null,
    tireRearPressureBar: base?.tireRearPressureBar ?? null,
    suspensions: units.map(({ componentId }) => {
      const from = valuesOf(restore, componentId) ?? valuesOf(current, componentId);
      return from ? { ...from, clicks: { ...from.clicks } } : emptyValues(componentId);
    }),
  };
  const skipped = restore
    ? restore.suspensions.filter((s) => !fitted.has(s.componentId)).length
    : 0;
  return { values, skipped };
}

/**
 * What the part's specs forbid in its values: clicks beyond the adjuster's range, a value for an
 * adjuster it does not have, a sag deeper than its travel. Keys are `<componentId>.<field>`.
 * A part without specs (described no longer) has nothing to check against.
 */
export function suspensionValueErrors(
  values: SuspensionValuesInput,
  specs: SuspensionSpecsInput | null,
): SetupFieldErrors {
  const errors: SetupFieldErrors = {};
  if (!specs) return errors;
  const key = (field: SuspensionField) => `${values.componentId}.${field}`;
  for (const code of DAMPER_ADJUSTERS) {
    const clicks = values.clicks[code];
    if (clicks == null) continue;
    const max = specs.maxClicks[code];
    if (max == null) errors[key(code)] = "Cette pièce n'a pas cette molette.";
    else if (clicks > max) errors[key(code)] = `Au plus ${max} clics.`;
  }
  if (values.sagMm != null && specs.travelMm != null && values.sagMm > specs.travelMm) {
    errors[key("sagMm")] = `Plus que la course de la pièce (${formatMillimetres(specs.travelMm)}).`;
  }
  return errors;
}

// --- Display -------------------------------------------------------------------------------------

export function formatPsi(value: number): string {
  return withUnit(decimalText(value, 1), "psi");
}

export function formatBar(value: number): string {
  return withUnit(decimalText(value, 2), "bar");
}

export function formatSpringRate(value: number): string {
  return withUnit(formatInteger(value), "lb/in");
}

export function formatMillimetres(value: number): string {
  return withUnit(decimalText(value, 1), "mm");
}

/** "34 mm · 20 %", or "34 mm" when the travel is unknown. */
export function formatSag(sagMm: number, travelMm: number | null): string {
  const percent = sagPercent(sagMm, travelMm);
  return percent == null
    ? formatMillimetres(sagMm)
    : `${formatMillimetres(sagMm)} · ${withUnit(formatInteger(percent), "%")}`;
}

/** "8 clics" (from closed). */
export function formatClicks(value: number): string {
  return `${formatInteger(value)} clic${value > 1 ? "s" : ""}`;
}

/** "15–20 %", or "≈ 30 %" for a single figure. */
export function formatSagTargetPercent(target: { minPercent: number; maxPercent: number }): string {
  return target.minPercent === target.maxPercent
    ? `≈${NBSP}${withUnit(formatInteger(target.minPercent), "%")}`
    : withUnit(`${formatInteger(target.minPercent)}–${formatInteger(target.maxPercent)}`, "%");
}

/** The target in mm for the part's travel: "24–32 mm"; null when the travel is unknown. */
export function formatSagTargetMm(
  target: { minPercent: number; maxPercent: number },
  travelMm: number | null,
): string | null {
  if (travelMm == null || travelMm <= 0) return null;
  const min = (target.minPercent / 100) * travelMm;
  const max = (target.maxPercent / 100) * travelMm;
  return target.minPercent === target.maxPercent
    ? `≈${NBSP}${withUnit(decimalText(min, 1), "mm")}`
    : withUnit(`${decimalText(min, 1)}–${decimalText(max, 1)}`, "mm");
}
