"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input } from "@/components/ui/field";
import { InfoPopover } from "@/components/ui/info-popover";
import { DAMPER_ADJUSTERS, type DamperAdjuster, type SpringType } from "@/lib/enums";
import { DAMPER_ADJUSTER_LABELS, SPRING_TYPE_LABELS } from "@/lib/labels";
import { decimalText, parseDecimalInput } from "@/lib/parse";
import { CLICKS_CONVENTION } from "@/lib/setup-advice";
import type { SuspensionSpecsInput } from "@/lib/view-models";

/*
 * The "Suspension" part of the component sheet (D-79), for a fork or a rear shock: whether a fork
 * is a suspension fork, its spring, its own travel, and the clicks of each damper adjuster it has.
 * The "Réglages" tab of the bike page is built from these.
 */

export type SuspensionFormValues = {
  /** A fork only: unticked, the fork is rigid. A rear shock is always a suspension part. */
  suspended: boolean;
  springType: SpringType;
  travel: string;
  maxClicks: Record<DamperAdjuster, string>;
};

export type SuspensionFormErrors = Partial<Record<"travel" | DamperAdjuster, string>>;

export function suspensionFormValues(
  specs: SuspensionSpecsInput | null,
  suspendedByDefault: boolean,
): SuspensionFormValues {
  return {
    suspended: specs ? true : suspendedByDefault,
    springType: specs?.springType ?? "air",
    travel: specs?.travelMm != null ? decimalText(specs.travelMm, 1) : "",
    maxClicks: Object.fromEntries(
      DAMPER_ADJUSTERS.map((a) => [
        a,
        specs?.maxClicks[a] != null ? String(specs.maxClicks[a]) : "",
      ]),
    ) as Record<DamperAdjuster, string>,
  };
}

/** The specs to save (null: a rigid fork), or the errors of the fields. */
export function readSuspensionForm(
  typeCode: "fork" | "rear_shock",
  values: SuspensionFormValues,
): { specs: SuspensionSpecsInput | null; errors: SuspensionFormErrors } {
  if (typeCode === "fork" && !values.suspended) return { specs: null, errors: {} };
  const errors: SuspensionFormErrors = {};
  const travel = parseDecimalInput(values.travel);
  if (travel != null && (Number.isNaN(travel) || travel <= 0 || travel > 300)) {
    errors.travel = "Un nombre de millimètres, 300 au plus.";
  }
  const maxClicks = {} as Record<DamperAdjuster, number | null>;
  for (const adjuster of DAMPER_ADJUSTERS) {
    const text = values.maxClicks[adjuster].trim();
    const clicks = text ? Number(text) : null;
    if (clicks != null && (!Number.isInteger(clicks) || clicks < 1 || clicks > 60)) {
      errors[adjuster] = "Un nombre entier entre 1 et 60.";
    }
    maxClicks[adjuster] = clicks != null && Number.isInteger(clicks) ? clicks : null;
  }
  return {
    specs: {
      springType: values.springType,
      travelMm: travel == null || Number.isNaN(travel) ? null : travel,
      maxClicks,
    },
    errors,
  };
}

/** The id of the first field in error, to focus it. */
export function firstSuspensionErrorId(errors: SuspensionFormErrors): string | null {
  if (errors.travel) return "part-travel";
  const adjuster = DAMPER_ADJUSTERS.find((a) => errors[a]);
  return adjuster ? `part-max-${adjuster}` : null;
}

export function SuspensionSpecsFields({
  typeCode,
  values,
  onChange,
  errors,
  error,
  standalone = false,
}: {
  typeCode: "fork" | "rear_shock";
  values: SuspensionFormValues;
  onChange: (values: SuspensionFormValues) => void;
  errors: SuspensionFormErrors;
  /** An error of the whole section, from the server. */
  error?: string;
  /**
   * The "Débattement et molettes" sheet of the setup tab (D-83): the part is a suspension part,
   * so no "Fourche suspendue" box and no section legend.
   */
  standalone?: boolean;
}) {
  const set = <K extends keyof SuspensionFormValues>(key: K, value: SuspensionFormValues[K]) =>
    onChange({ ...values, [key]: value });
  const shown = standalone || typeCode === "rear_shock" || values.suspended;

  return (
    <Fieldset
      legend={standalone ? "Débattement et molettes" : "Suspension"}
      legendClassName={standalone ? "sr-only" : undefined}
      hint={standalone ? undefined : "pour l'onglet Réglages du vélo"}
      error={error}
    >
      {typeCode === "fork" && !standalone ? (
        <label className="flex min-h-9 items-center gap-2.5 text-[14px] pointer-coarse:min-h-11">
          <input
            type="checkbox"
            className="size-[18px] shrink-0 accent-[var(--brand)]"
            checked={values.suspended}
            onChange={(e) => set("suspended", e.target.checked)}
          />
          Fourche suspendue
        </label>
      ) : null}
      {shown ? (
        <>
          <div className="grid grid-cols-2 items-start gap-2.5">
            <Fieldset legend="Ressort" legendClassName="mb-1.5">
              <ChipRow>
                {(["air", "coil"] as const).map((spring) => (
                  <Chip
                    key={spring}
                    size="sm"
                    name="springType"
                    value={spring}
                    checked={values.springType === spring}
                    onChange={() => set("springType", spring)}
                  >
                    {SPRING_TYPE_LABELS[spring]}
                  </Chip>
                ))}
              </ChipRow>
            </Fieldset>
            <Field
              label={typeCode === "fork" ? "Débattement" : "Course"}
              id="part-travel"
              error={errors.travel}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder={typeCode === "fork" ? "160" : "65"}
                suffix="mm"
                value={values.travel}
                onChange={(e) => set("travel", e.target.value)}
              />
            </Field>
          </div>
          {typeCode === "rear_shock" ? (
            <p className="-mt-1 hint">
              La course de l&apos;amortisseur, pas le débattement de la roue : le SAG se mesure
              dessus.
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="flex items-center gap-1 text-[13.5px] font-semibold">
              Molettes · clics de fermé à ouvert
              <InfoPopover label="Comment compter les clics">{CLICKS_CONVENTION}</InfoPopover>
            </p>
            <p className="-mt-1 hint">Laisse vide une molette que ta pièce n&apos;a pas.</p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {DAMPER_ADJUSTERS.map((adjuster) => {
                const id = `part-max-${adjuster}`;
                const label = DAMPER_ADJUSTER_LABELS[adjuster];
                return (
                  <li key={adjuster} className="grid gap-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3">
                      <label htmlFor={id} className="text-[14px]">
                        {label.name} <span className="text-fg-muted">({label.short})</span>
                      </label>
                      <Input
                        id={id}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="–"
                        suffix="clics"
                        aria-invalid={errors[adjuster] ? true : undefined}
                        aria-describedby={errors[adjuster] ? `${id}-error` : undefined}
                        value={values.maxClicks[adjuster]}
                        onChange={(e) =>
                          set("maxClicks", { ...values.maxClicks, [adjuster]: e.target.value })
                        }
                      />
                    </div>
                    {errors[adjuster] ? (
                      <FieldError id={`${id}-error`}>{errors[adjuster]}</FieldError>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </Fieldset>
  );
}
