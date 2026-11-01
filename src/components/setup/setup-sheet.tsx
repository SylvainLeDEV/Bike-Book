"use client";

import * as React from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { SagHowTo } from "./sag-how-to";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, Textarea } from "@/components/ui/field";
import { InfoPopover } from "@/components/ui/info-popover";
import {
  SegmentedTabs,
  SegmentedTabsContent,
  SegmentedTabsList,
  SegmentedTabsTrigger,
} from "@/components/ui/segmented-tabs";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { DAMPER_ADJUSTERS, type DamperAdjuster, type SuspensionTypeCode } from "@/lib/enums";
import { formatDate, formatInteger, isLocalDate, withUnit, type LocalDate } from "@/lib/format";
import { DAMPER_ADJUSTER_LABELS, SETUP_UNIT_LABELS } from "@/lib/labels";
import { decimalText, parseDecimalInput } from "@/lib/parse";
import {
  adjustersOf,
  formatSagTargetMm,
  formatSagTargetPercent,
  sagPercent,
  suspensionValueErrors,
} from "@/lib/setup";
import { CLICKS_CONVENTION, sagTargetOf } from "@/lib/setup-advice";
import type {
  SaveSetupResult,
  SetupFieldErrors,
  SetupInput,
  SuspensionUnitVM,
  SuspensionValuesInput,
} from "@/lib/view-models";

/*
 * "Nouveau réglage" / "Modifier le réglage" (D-79): the date, an optional name, then the fork, the
 * rear shock and the tyres, one at a time as in the tab, and notes. A new setup starts from the
 * current values; saving adds a dated entry to the log. Built without a mockup.
 */

export type SetupUnitView = SuspensionTypeCode | "tires";

export type SetupSheetMode =
  | {
      kind: "new";
      values: SetupInput;
      unit: SetupUnitView;
      restoredFrom?: { setOn: LocalDate; label: string | null; skipped: number };
    }
  | { kind: "edit"; id: number; values: SetupInput; unit: SetupUnitView };

type UnitForm = {
  pressure: string;
  spring: string;
  spacers: string;
  sag: string;
  clicks: Record<DamperAdjuster, string>;
};

type Form = {
  setOn: string;
  label: string;
  notes: string;
  front: string;
  rear: string;
  units: Record<number, UnitForm>;
};

const text = (value: number | null, digits: number) =>
  value == null ? "" : decimalText(value, digits);

function unitForm(values: SuspensionValuesInput | undefined): UnitForm {
  return {
    pressure: text(values?.airPressurePsi ?? null, 1),
    spring: text(values?.springRateLbPerIn ?? null, 0),
    spacers: text(values?.volumeSpacers ?? null, 0),
    sag: text(values?.sagMm ?? null, 1),
    clicks: Object.fromEntries(
      DAMPER_ADJUSTERS.map((a) => [a, text(values?.clicks[a] ?? null, 0)]),
    ) as Record<DamperAdjuster, string>,
  };
}

function initialForm(units: SuspensionUnitVM[], values: SetupInput): Form {
  return {
    setOn: values.setOn,
    label: values.label ?? "",
    notes: values.notes ?? "",
    front: text(values.tireFrontPressureBar, 2),
    rear: text(values.tireRearPressureBar, 2),
    units: Object.fromEntries(
      units.map((unit) => [
        unit.componentId,
        unitForm(values.suspensions.find((s) => s.componentId === unit.componentId)),
      ]),
    ),
  };
}

/** The element id of a field: header fields by name, a part's values by part and field. */
const fieldId = (key: string) => `setup-${key.replace(".", "-")}`;

export function SetupSheet({
  open,
  onOpenChange,
  bikeName,
  units,
  today,
  mode,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikeName: string;
  units: SuspensionUnitVM[];
  today: LocalDate;
  mode: SetupSheetMode | null;
  onSubmit: (mode: SetupSheetMode, input: SetupInput) => Promise<SaveSetupResult>;
  onDelete?: (id: number) => Promise<SaveSetupResult>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={mode?.kind === "edit" ? "Modifier le réglage" : "Nouveau réglage"}
        description={bikeName}
      >
        {open && mode ? (
          <SetupForm
            // A new mode (another entry, another unit) starts a fresh form.
            key={`${mode.kind}-${mode.kind === "edit" ? mode.id : mode.values.setOn}-${mode.unit}`}
            units={units}
            today={today}
            mode={mode}
            onSubmit={async (input) => {
              const result = await onSubmit(mode, input);
              if (result.ok) onOpenChange(false);
              return result;
            }}
            onDelete={
              mode.kind === "edit" && onDelete
                ? async () => {
                    const result = await onDelete(mode.id);
                    if (result.ok) onOpenChange(false);
                    return result;
                  }
                : undefined
            }
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SetupForm({
  units,
  today,
  mode,
  onSubmit,
  onDelete,
}: {
  units: SuspensionUnitVM[];
  today: LocalDate;
  mode: SetupSheetMode;
  onSubmit: (input: SetupInput) => Promise<SaveSetupResult>;
  onDelete?: () => Promise<SaveSetupResult>;
}) {
  const [form, setForm] = React.useState<Form>(() => initialForm(units, mode.values));
  const [view, setView] = React.useState<SetupUnitView>(
    mode.unit === "tires" || units.some((u) => u.typeCode === mode.unit) ? mode.unit : "tires",
  );
  const [errors, setErrors] = React.useState<SetupFieldErrors>({});
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const setUnit = (componentId: number, patch: Partial<UnitForm>) =>
    setForm((f) => ({
      ...f,
      units: { ...f.units, [componentId]: { ...f.units[componentId], ...patch } },
    }));

  /** Shows the errors: the view of the first one, then its field. */
  function showErrors(next: SetupFieldErrors) {
    setErrors(next);
    const first = Object.keys(next).find((key) => key !== "form");
    if (!first) return;
    const componentId = Number(first.split(".")[0]);
    const unit = units.find((u) => u.componentId === componentId);
    if (unit) setView(unit.typeCode);
    else if (first.startsWith("tire")) setView("tires");
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>(`#${fieldId(first)}`)?.focus(),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: SetupFieldErrors = {};
    const decimal = (value: string, key: string, message: string) => {
      const n = parseDecimalInput(value);
      if (n != null && (Number.isNaN(n) || n <= 0)) next[key] = message;
      return n == null || Number.isNaN(n) ? null : n;
    };
    const integer = (value: string, key: string, message: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) {
        next[key] = message;
        return null;
      }
      return n;
    };
    if (!isLocalDate(form.setOn)) next.setOn = "Indique la date.";
    else if (form.setOn > today) next.setOn = "La date ne peut pas être dans le futur.";
    const suspensions: SuspensionValuesInput[] = units.map((unit) => {
      const f = form.units[unit.componentId];
      const key = (field: string) => `${unit.componentId}.${field}`;
      const sag = parseDecimalInput(f.sag);
      if (sag != null && Number.isNaN(sag)) next[key("sagMm")] = "SAG invalide.";
      const values: SuspensionValuesInput = {
        componentId: unit.componentId,
        airPressurePsi: decimal(f.pressure, key("airPressurePsi"), "Pression invalide."),
        springRateLbPerIn: integer(
          f.spring,
          key("springRateLbPerIn"),
          "Un nombre entier de lb/in.",
        ),
        volumeSpacers: integer(f.spacers, key("volumeSpacers"), "Un nombre entier."),
        sagMm: sag == null || Number.isNaN(sag) ? null : sag,
        clicks: Object.fromEntries(
          DAMPER_ADJUSTERS.map((a) => [
            a,
            integer(f.clicks[a], key(a), "Un nombre entier de clics."),
          ]),
        ) as Record<DamperAdjuster, number | null>,
      };
      for (const [k, message] of Object.entries(suspensionValueErrors(values, unit.specs))) {
        next[k] ??= message;
      }
      return values;
    });
    const input: SetupInput = {
      setOn: form.setOn,
      label: form.label.trim() || null,
      notes: form.notes.trim() || null,
      tireFrontPressureBar: decimal(form.front, "tireFrontPressureBar", "Pression invalide."),
      tireRearPressureBar: decimal(form.rear, "tireRearPressureBar", "Pression invalide."),
      // A part no longer fitted keeps its values in the setup being corrected.
      suspensions: [
        ...suspensions,
        ...mode.values.suspensions.filter(
          (s) => !units.some((unit) => unit.componentId === s.componentId),
        ),
      ],
    };
    if (Object.keys(next).length) {
      showErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await onSubmit(input);
      if (!result.ok)
        showErrors({ ...result.fieldErrors, ...(result.error ? { form: result.error } : {}) });
    } catch {
      setErrors({ form: "Enregistrement impossible. Vérifie la connexion et réessaie." });
    } finally {
      setPending(false);
    }
  }

  const views: SetupUnitView[] = [...units.map((unit) => unit.typeCode), "tires"];

  return (
    <SheetForm ref={formRef} onSubmit={submit}>
      <SheetBody>
        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        {mode.kind === "new" && mode.restoredFrom ? (
          <p className="rounded-control bg-surface-2 px-3 py-2.5 text-[13.5px] leading-snug">
            Valeurs reprises du réglage du{" "}
            {formatDate(mode.restoredFrom.setOn, { year: "auto", today })}
            {mode.restoredFrom.label ? ` « ${mode.restoredFrom.label} »` : ""}. Vérifie-les : un
            nouveau réglage daté d&apos;aujourd&apos;hui s&apos;ajoute à l&apos;historique.
            {mode.restoredFrom.skipped
              ? ` ${mode.restoredFrom.skipped > 1 ? "Des pièces" : "Une pièce"} de ce réglage ${mode.restoredFrom.skipped > 1 ? "ne sont" : "n'est"} plus ${mode.restoredFrom.skipped > 1 ? "montées" : "montée"} : ${mode.restoredFrom.skipped > 1 ? "leurs" : "ses"} valeurs ne sont pas reprises.`
              : ""}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Date" id={fieldId("setOn")} error={errors.setOn}>
            <Input
              type="date"
              max={today}
              value={form.setOn}
              onChange={(e) => setForm((f) => ({ ...f, setOn: e.target.value }))}
            />
          </Field>
          <Field label="Nom" id={fieldId("label")} error={errors.label} hint="facultatif">
            <Input
              autoComplete="off"
              maxLength={60}
              placeholder="Ex. Bike park"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </Field>
        </div>

        <SegmentedTabs value={view} onValueChange={(value) => setView(value as SetupUnitView)}>
          {views.length > 1 ? (
            <SegmentedTabsList aria-label="Partie du vélo" className="mb-3">
              {views.map((v) => (
                <SegmentedTabsTrigger key={v} value={v}>
                  {SETUP_UNIT_LABELS[v]}
                </SegmentedTabsTrigger>
              ))}
            </SegmentedTabsList>
          ) : null}
          {units.map((unit) => (
            // Every view stays mounted: what was typed in one is kept when switching.
            <SegmentedTabsContent
              key={unit.componentId}
              value={unit.typeCode}
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <UnitFields
                unit={unit}
                form={form.units[unit.componentId]}
                errors={errors}
                onChange={(patch) => setUnit(unit.componentId, patch)}
              />
            </SegmentedTabsContent>
          ))}
          <SegmentedTabsContent value="tires" forceMount className="data-[state=inactive]:hidden">
            <div className="grid grid-cols-2 gap-2.5">
              <Field
                label="Pneu avant"
                id={fieldId("tireFrontPressureBar")}
                error={errors.tireFrontPressureBar}
              >
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  suffix="bar"
                  value={form.front}
                  onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))}
                />
              </Field>
              <Field
                label="Pneu arrière"
                id={fieldId("tireRearPressureBar")}
                error={errors.tireRearPressureBar}
              >
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  suffix="bar"
                  value={form.rear}
                  onChange={(e) => setForm((f) => ({ ...f, rear: e.target.value }))}
                />
              </Field>
            </div>
          </SegmentedTabsContent>
        </SegmentedTabs>

        <Field label="Notes" id={fieldId("notes")} error={errors.notes}>
          <Textarea
            maxLength={2000}
            placeholder="Pourquoi ce changement, ce que tu as ressenti…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>
      </SheetBody>
      <SheetFooter className="grid gap-2">
        {confirmDelete && onDelete ? (
          <DeleteConfirm
            question="Supprimer ce réglage de l'historique ? Les autres réglages ne changent pas."
            confirmLabel="Supprimer le réglage"
            pending={pending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setPending(true);
              try {
                const result = await onDelete();
                if (!result.ok) setErrors({ form: result.error ?? "Suppression impossible." });
              } catch {
                setErrors({ form: "Suppression impossible. Vérifie la connexion et réessaie." });
              } finally {
                setPending(false);
                setConfirmDelete(false);
              }
            }}
          />
        ) : (
          <>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <Check />
              {mode.kind === "edit" ? "Enregistrer les modifications" : "Enregistrer le réglage"}
            </Button>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-late-ink hover:text-late-ink"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Supprimer le réglage
              </Button>
            ) : null}
          </>
        )}
      </SheetFooter>
    </SheetForm>
  );
}

function UnitFields({
  unit,
  form,
  errors,
  onChange,
}: {
  unit: SuspensionUnitVM;
  form: UnitForm;
  errors: SetupFieldErrors;
  onChange: (patch: Partial<UnitForm>) => void;
}) {
  const key = (field: string) => `${unit.componentId}.${field}`;
  const coil = unit.specs?.springType === "coil";
  const adjusters = adjustersOf(unit.specs);
  const travel = unit.specs?.travelMm ?? null;
  const sag = parseDecimalInput(form.sag);
  const percent = sag == null || Number.isNaN(sag) ? null : sagPercent(sag, travel);
  const target = sagTargetOf(unit.typeCode, unit.specs?.springType ?? null);
  const targetMm = formatSagTargetMm(target, travel);
  const of = unit.typeCode === "fork" ? "du débattement" : "de la course";

  return (
    <div className="grid gap-4">
      <p className="-mb-1 text-[13.5px] text-fg-muted">{unit.name}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {coil ? (
          <Field
            label="Ressort"
            id={fieldId(key("springRateLbPerIn"))}
            error={errors[key("springRateLbPerIn")]}
          >
            <Input
              inputMode="numeric"
              autoComplete="off"
              suffix="lb/in"
              value={form.spring}
              onChange={(e) => onChange({ spring: e.target.value })}
            />
          </Field>
        ) : (
          <>
            <Field
              label="Pression"
              id={fieldId(key("airPressurePsi"))}
              error={errors[key("airPressurePsi")]}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                suffix="psi"
                value={form.pressure}
                onChange={(e) => onChange({ pressure: e.target.value })}
              />
            </Field>
            <Field
              label="Tokens"
              id={fieldId(key("volumeSpacers"))}
              error={errors[key("volumeSpacers")]}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={form.spacers}
                onChange={(e) => onChange({ spacers: e.target.value })}
              />
            </Field>
          </>
        )}
        <Field
          label="SAG mesuré"
          id={fieldId(key("sagMm"))}
          error={errors[key("sagMm")]}
          className="col-span-2"
          hint={
            <span className="flex flex-wrap items-center gap-x-1">
              {percent != null ? (
                <span className="font-semibold text-fg">
                  {withUnit(formatInteger(percent), "%")} {of} ·
                </span>
              ) : null}
              <span>
                repère {formatSagTargetPercent(target)}
                {targetMm ? ` (${targetMm})` : ""}
                {travel == null
                  ? ` · indique ${unit.typeCode === "fork" ? "le débattement" : "la course"} (Modifier, dans l'onglet) pour voir ton %`
                  : ""}
              </span>
              <SagHowTo typeCode={unit.typeCode} />
            </span>
          }
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            suffix="mm"
            value={form.sag}
            onChange={(e) => onChange({ sag: e.target.value })}
          />
        </Field>
      </div>

      {adjusters.length ? (
        <div className="grid gap-2">
          <p className="flex items-center gap-1 text-[13.5px] font-semibold">
            Molettes · clics depuis fermé
            <InfoPopover label="Comment compter les clics">{CLICKS_CONVENTION}</InfoPopover>
          </p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {adjusters.map(({ code, maxClicks }) => (
              <li key={code} className="grid gap-1">
                <ClickStepper
                  id={fieldId(key(code))}
                  label={DAMPER_ADJUSTER_LABELS[code]}
                  value={form.clicks[code]}
                  max={maxClicks}
                  error={errors[key(code)]}
                  onChange={(value) => onChange({ clicks: { ...form.clicks, [code]: value } })}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint">
          {unit.specs
            ? "Aucune molette renseignée pour cette pièce."
            : "Ses molettes ne sont pas renseignées : indique-les avec « Modifier », dans l'onglet."}
        </p>
      )}
    </div>
  );
}

/** A click count with "−" and "+" (44 px on touch screens) and its range. */
function ClickStepper({
  id,
  label,
  value,
  max,
  error,
  onChange,
}: {
  id: string;
  label: { name: string; short: string };
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  const current = value.trim() === "" ? null : Number(value);
  const step = (delta: number) => {
    const base = current == null || Number.isNaN(current) ? (delta > 0 ? 0 : 1) : current;
    onChange(String(Math.min(max, Math.max(0, base + delta))));
  };
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <label htmlFor={id} className="text-[14px] leading-tight">
          {label.name} <span className="text-fg-muted">({label.short})</span>
        </label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`Un clic de moins (${label.short})`}
            onClick={() => step(-1)}
          >
            <Minus />
          </Button>
          <Input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            className="w-[4.5rem]"
            suffix={`/ ${max}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`Un clic de plus (${label.short})`}
            onClick={() => step(1)}
          >
            <Plus />
          </Button>
        </div>
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </>
  );
}
