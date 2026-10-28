"use client";

import * as React from "react";
import { Calendar, Check, Plus, Repeat, Trash2 } from "lucide-react";
import { AttachmentsBlock, AttachmentsLater } from "@/components/attachments/attachments-block";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { MAINTENANCE_LINE_ACTIONS, MEASUREMENT_UNITS, type MeasurementUnit } from "@/lib/enums";
import { addDays, formatDecimal, formatMoney } from "@/lib/format";
import { MAINTENANCE_ACTION_LABELS, SHOP_KIND_LABELS } from "@/lib/labels";
import { nameKey } from "@/lib/names";
import { decimalText, parseDecimalInput, parseMoneyInput } from "@/lib/parse";
import type {
  EditResult,
  MaintenanceEditVM,
  MaintenanceFormVM,
  MaintenanceInput,
  MaintenanceLineInput,
  SaveMaintenanceResult,
  ShopKind,
} from "@/lib/view-models";

/*
 * "Nouvel entretien" (D-63, validated on its preview): date, title, done at home or by a shop,
 * then the interventions, each with its part, detail, cost and an optional measurement. The total
 * is the sum of the lines unless an invoice total is typed. Replacements have their own sheet.
 * "Modifier l'entretien" (D-70) reopens it filled; the event's replacements are listed, not
 * editable: a new date moves them, deleting the event undoes them.
 */

const UNIT_LABELS: Record<MeasurementUnit, string> = { percent: "%", mm: "mm" };

export type MaintenanceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vm: MaintenanceFormVM;
  /** Lines to start with ("C'est fait" on a rule, feature 6). */
  prefill?: { title: string; lines: MaintenanceLineInput[] } | null;
  onSubmit: (input: MaintenanceInput) => Promise<SaveMaintenanceResult>;
  /** The event being edited (D-70): the sheet then calls `onUpdate`, and offers `onDelete`. */
  edit?: MaintenanceEditVM | null;
  onUpdate?: (eventId: number, input: MaintenanceInput) => Promise<EditResult>;
  onDelete?: (eventId: number) => Promise<EditResult>;
};

export function MaintenanceSheet({
  open,
  onOpenChange,
  vm,
  prefill,
  onSubmit,
  edit,
  onUpdate,
  onDelete,
}: MaintenanceSheetProps) {
  const editing = edit ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Modifier l'entretien" : "Nouvel entretien"}
        description={vm.bike.name}
      >
        {open ? (
          <MaintenanceForm
            // Another event, or none, starts a fresh form.
            key={editing?.eventId ?? "new"}
            vm={vm}
            prefill={editing ? null : (prefill ?? null)}
            edit={editing}
            onSubmit={async (input) => {
              const result =
                editing && onUpdate
                  ? await onUpdate(editing.eventId, input)
                  : await onSubmit(input);
              if (result.ok) onOpenChange(false);
              return result.ok ? null : result.error;
            }}
            onDelete={
              editing && onDelete
                ? async () => {
                    const result = await onDelete(editing.eventId);
                    if (result.ok) onOpenChange(false);
                    return result.ok ? null : result.error;
                  }
                : undefined
            }
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type When = "today" | "yesterday" | "other";

type Line = {
  key: number;
  action: MaintenanceLineInput["action"];
  componentId: string;
  /** "" : no rule reset. */
  ruleId: string;
  description: string;
  cost: string;
  measure: string;
  unit: MeasurementUnit;
  measureOpen: boolean;
};

let nextKey = 1;
function newLine(fields: Partial<Line> = {}): Line {
  return {
    key: nextKey++,
    action: "serviced",
    componentId: "",
    ruleId: "",
    description: "",
    cost: "",
    measure: "",
    unit: "mm",
    measureOpen: false,
    ...fields,
  };
}

/** "Remet à zéro « … »": a box for one rule, a list when several rules fit the part. */
function RuleReset({
  index,
  rules,
  value,
  onChange,
}: {
  index: number;
  rules: MaintenanceFormVM["rules"];
  value: string;
  onChange: (ruleId: string) => void;
}) {
  if (!rules.length) return null;
  if (rules.length === 1) {
    const rule = rules[0];
    return (
      <label className="flex min-h-9 items-center gap-2.5 text-[13.5px] pointer-coarse:min-h-11">
        <input
          type="checkbox"
          className="size-[18px] accent-[var(--brand)]"
          checked={value === String(rule.id)}
          onChange={(e) => onChange(e.target.checked ? String(rule.id) : "")}
        />
        Remet à zéro « {rule.title} »
      </label>
    );
  }
  return (
    <Field label={`Règle remise à zéro par l'intervention ${index + 1}`} hideLabel>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ne remet aucune règle à zéro</option>
        {rules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            Remet à zéro « {rule.title} »
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** Cents as typed in a money box: "12,50". */
const moneyText = (cents: number) => formatDecimal(cents / 100, 2);

function MaintenanceForm({
  vm,
  prefill,
  edit,
  onSubmit,
  onDelete,
}: {
  vm: MaintenanceFormVM;
  prefill: MaintenanceSheetProps["prefill"];
  edit: MaintenanceEditVM | null;
  onSubmit: (input: MaintenanceInput) => Promise<string | null>;
  /** Shown when editing; resolves with an error or null. */
  onDelete?: () => Promise<string | null>;
}) {
  const initial = edit?.input ?? null;
  const initialWhen: When = !initial
    ? "today"
    : initial.on === vm.today
      ? "today"
      : initial.on === addDays(vm.today, -1)
        ? "yesterday"
        : "other";
  const replacements = edit?.replacements ?? [];
  // An event made by "Remplacer une pièce" may hold no other line.
  const minLines = replacements.length ? 0 : 1;
  const parts = [...vm.parts, ...(edit?.formerParts ?? [])];
  const [when, setWhen] = React.useState<When>(initialWhen);
  const [otherDate, setOtherDate] = React.useState(
    initialWhen === "other" && initial ? initial.on : addDays(vm.today, -2),
  );
  const [title, setTitle] = React.useState(initial?.title ?? prefill?.title ?? "");
  const [performedBy, setPerformedBy] = React.useState<"self" | "shop">(
    initial?.performedBy ?? "self",
  );
  const [shopName, setShopName] = React.useState(initial?.shop?.name ?? "");
  const [shopKind, setShopKind] = React.useState<ShopKind>(initial?.shop?.kind ?? "physical");
  const [lines, setLines] = React.useState<Line[]>(() => {
    const start = initial?.lines ?? prefill?.lines ?? [];
    if (!start.length) return initial && minLines === 0 ? [] : [newLine({ ruleId: firstRule("") })];
    return start.map((line) =>
      newLine({
        action: line.action,
        componentId: line.componentId == null ? "" : String(line.componentId),
        ruleId: line.ruleId == null ? "" : String(line.ruleId),
        description: line.description ?? "",
        cost: line.costCents == null ? "" : moneyText(line.costCents),
        measure: line.measurementValue == null ? "" : decimalText(line.measurementValue, 2),
        unit: line.measurementUnit ?? "mm",
        measureOpen: line.measurementValue != null,
      }),
    );
  });
  const [typedTotal, setTypedTotal] = React.useState<string | null>(
    initial?.totalCostCents == null ? null : moneyText(initial.totalCostCents),
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [errors, setErrors] = React.useState<{ title?: string; total?: string; form?: string }>({});
  const [lineErrors, setLineErrors] = React.useState<Record<number, string>>({});
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  /** The rules a line on this part (or the whole bike) can reset. */
  function rulesFor(componentId: string) {
    return vm.rules.filter((rule) =>
      componentId ? rule.componentIds.includes(Number(componentId)) : rule.bikeLevel,
    );
  }
  function firstRule(componentId: string) {
    return String(rulesFor(componentId)[0]?.id ?? "");
  }
  const update = (key: number, fields: Partial<Line>) =>
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...fields } : line)));
  const shopIsNew =
    shopName.trim() !== "" && !vm.shops.some((shop) => nameKey(shop.name) === nameKey(shopName));

  const lineCosts = lines.map((line) => parseMoneyInput(line.cost));
  const sum = [...lineCosts, ...replacements.map((r) => r.costCents)].reduce<number>(
    (total, cost) => total + (cost && cost > 0 ? cost : 0),
    0,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const nextLineErrors: Record<number, string> = {};
    if (!title.trim()) nextErrors.title = "Donne un titre à l'entretien.";
    const total = typedTotal == null ? null : parseMoneyInput(typedTotal);
    if (total != null && Number.isNaN(total)) nextErrors.total = "Montant invalide.";
    const parsedLines: MaintenanceLineInput[] = [];
    lines.forEach((line, index) => {
      const cost = lineCosts[index];
      const measure = parseDecimalInput(line.measure);
      if (cost != null && Number.isNaN(cost)) nextLineErrors[line.key] = "Coût invalide.";
      if (measure != null && Number.isNaN(measure)) nextLineErrors[line.key] = "Mesure invalide.";
      parsedLines.push({
        action: line.action,
        componentId: line.componentId ? Number(line.componentId) : null,
        ruleId: line.ruleId ? Number(line.ruleId) : null,
        description: line.description.trim() || null,
        costCents: cost == null || Number.isNaN(cost) ? null : cost,
        measurementValue: measure == null || Number.isNaN(measure) ? null : measure,
        measurementUnit: measure == null || Number.isNaN(measure) ? null : line.unit,
      });
    });
    setErrors(nextErrors);
    setLineErrors(nextLineErrors);
    if (Object.keys(nextErrors).length || Object.keys(nextLineErrors).length) {
      const target = nextErrors.title
        ? "#mt-title"
        : nextErrors.total
          ? "#mt-total"
          : `[data-line="${Object.keys(nextLineErrors)[0]}"] input`;
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(target)?.focus());
      return;
    }
    const known = vm.shops.find((shop) => nameKey(shop.name) === nameKey(shopName));
    setPending(true);
    try {
      const error = await onSubmit({
        bikeId: vm.bike.id,
        on: when === "today" ? vm.today : when === "yesterday" ? addDays(vm.today, -1) : otherDate,
        title: title.trim(),
        performedBy,
        shop:
          performedBy === "shop" && shopName.trim()
            ? { name: shopName.trim(), kind: known?.kind ?? shopKind }
            : null,
        totalCostCents: total,
        notes: notes.trim() || null,
        lines: parsedLines,
      });
      if (error) setErrors({ form: error });
    } catch {
      setErrors({ form: "Enregistrement impossible. Vérifie la connexion et réessaie." });
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm ref={formRef} onSubmit={submit}>
      <SheetBody>
        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        <Fieldset legend="Date">
          <ChipRow>
            {(
              [
                ["today", "Aujourd'hui"],
                ["yesterday", "Hier"],
                ["other", "Autre date"],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                name="when"
                value={value}
                checked={when === value}
                onChange={() => setWhen(value)}
              >
                {value === "other" ? <Calendar aria-hidden /> : null}
                {label}
              </Chip>
            ))}
          </ChipRow>
          {when === "other" ? (
            <Field label="Date de l'entretien">
              <Input
                type="date"
                max={vm.today}
                value={otherDate}
                onChange={(e) => setOtherDate(e.target.value)}
              />
            </Field>
          ) : null}
        </Fieldset>

        <Field label="Titre" id="mt-title" error={errors.title}>
          <Input
            autoComplete="off"
            maxLength={120}
            placeholder="Ex. Révision avant saison"
            value={title}
            data-autofocus=""
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Fieldset legend="Fait par">
          <ChipRow>
            <Chip
              name="performedBy"
              value="self"
              checked={performedBy === "self"}
              onChange={() => setPerformedBy("self")}
            >
              Moi
            </Chip>
            <Chip
              name="performedBy"
              value="shop"
              checked={performedBy === "shop"}
              onChange={() => setPerformedBy("shop")}
            >
              Un atelier
            </Chip>
          </ChipRow>
          {performedBy === "shop" ? (
            <>
              <Field label="Atelier">
                <Input
                  autoComplete="off"
                  maxLength={100}
                  list="mt-shop-options"
                  placeholder="Ex. Cycles du Lac"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                />
              </Field>
              <datalist id="mt-shop-options">
                {vm.shops.map((shop) => (
                  <option key={shop.id} value={shop.name} />
                ))}
              </datalist>
              {shopIsNew ? (
                <ChipRow aria-label="Type de la nouvelle boutique">
                  {(["physical", "online"] as const).map((kind) => (
                    <Chip
                      key={kind}
                      name="shopKind"
                      value={kind}
                      checked={shopKind === kind}
                      onChange={() => setShopKind(kind)}
                    >
                      {SHOP_KIND_LABELS[kind]}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
            </>
          ) : null}
        </Fieldset>

        <Fieldset legend="Interventions" hint="les remplacements ont leur propre feuille">
          {replacements.length ? (
            <ul className="m-0 grid list-none gap-2 p-0" aria-label="Remplacements de pièce">
              {replacements.map((replacement, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2.5 rounded-card bg-surface-2 p-3 text-[13.5px] leading-[1.45]"
                >
                  <Repeat className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {replacement.label}
                    <span className="block hint">
                      Remplacement : les pièces ne se modifient pas ici. Une nouvelle date déplace
                      aussi la pose ; supprimer l&apos;entretien remet l&apos;ancienne pièce.
                    </span>
                  </span>
                  {replacement.costCents != null ? (
                    <span className="num font-medium">{formatMoney(replacement.costCents)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <ol className="m-0 grid list-none gap-3 p-0">
            {lines.map((line, index) => (
              <li
                key={line.key}
                data-line={line.key}
                className="grid gap-2.5 rounded-card border border-border p-3"
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={`Intervention ${index + 1}`} hideLabel>
                    <NativeSelect
                      value={line.action}
                      onChange={(e) =>
                        update(line.key, { action: e.target.value as Line["action"] })
                      }
                    >
                      {MAINTENANCE_LINE_ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {MAINTENANCE_ACTION_LABELS[action]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={`Pièce de l'intervention ${index + 1}`} hideLabel>
                    <NativeSelect
                      value={line.componentId}
                      onChange={(e) =>
                        update(line.key, {
                          componentId: e.target.value,
                          ruleId: firstRule(e.target.value),
                        })
                      }
                    >
                      <option value="">Vélo entier</option>
                      {parts.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-start gap-2.5">
                  <Field label={`Détail de l'intervention ${index + 1}`} hideLabel>
                    <Input
                      autoComplete="off"
                      maxLength={200}
                      placeholder="Détail"
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value })}
                    />
                  </Field>
                  <Field label={`Coût de l'intervention ${index + 1}`} hideLabel>
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      suffix="€"
                      value={line.cost}
                      onChange={(e) => update(line.key, { cost: e.target.value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer l'intervention ${index + 1}`}
                    disabled={lines.length <= minLines}
                    onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <RuleReset
                  index={index}
                  rules={rulesFor(line.componentId)}
                  value={line.ruleId}
                  onChange={(ruleId) => update(line.key, { ruleId })}
                />
                {line.measureOpen ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2.5">
                    <Field
                      label="Mesure"
                      hint="Ex. allongement de chaîne, épaisseur des plaquettes."
                    >
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0,5"
                        value={line.measure}
                        onChange={(e) => update(line.key, { measure: e.target.value })}
                      />
                    </Field>
                    <Field label="Unité">
                      <NativeSelect
                        value={line.unit}
                        onChange={(e) =>
                          update(line.key, { unit: e.target.value as MeasurementUnit })
                        }
                      >
                        {MEASUREMENT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABELS[unit]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    className="justify-self-start text-[13px]"
                    onClick={() => update(line.key, { measureOpen: true })}
                  >
                    Ajouter une mesure
                  </Button>
                )}
                {lineErrors[line.key] ? <FieldError>{lineErrors[line.key]}</FieldError> : null}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            disabled={lines.length >= 20}
            onClick={() => setLines((list) => [...list, newLine({ ruleId: firstRule("") })])}
          >
            <Plus />
            Ajouter une intervention
          </Button>
        </Fieldset>

        <div className="grid gap-2 border-t border-border pt-3">
          {typedTotal == null ? (
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] font-semibold">Coût total</span>
              <span className="num text-[19px] font-semibold">{formatMoney(sum)}</span>
              <span className="w-full hint">
                Somme des interventions.{" "}
                <Button
                  type="button"
                  variant="link"
                  className="text-[13px]"
                  onClick={() => setTypedTotal(sum ? formatDecimal(sum / 100, 2) : "")}
                >
                  Saisir un autre total
                </Button>
              </span>
            </p>
          ) : (
            <Field
              label="Coût total"
              id="mt-total"
              hint="Le total de la facture, s'il diffère de la somme des lignes."
              error={errors.total}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                suffix="€"
                value={typedTotal}
                onChange={(e) => setTypedTotal(e.target.value)}
              />
            </Field>
          )}
        </div>

        <Field label="Notes">
          <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {edit ? (
          <AttachmentsBlock owner={{ kind: "maintenance_event", id: edit.eventId }} />
        ) : (
          <AttachmentsLater />
        )}
      </SheetBody>
      <SheetFooter className="grid gap-2">
        {confirmDelete && onDelete ? (
          <DeleteConfirm
            question={
              replacements.length
                ? "Supprimer cet entretien ? Les pièces qu'il a remplacées reviennent sur le vélo, celles prises dans l'atelier y retournent, et les règles reprennent leur compte précédent."
                : "Supprimer cet entretien et ses interventions ? Les règles qu'il remettait à zéro reprennent leur compte précédent."
            }
            confirmLabel="Supprimer l'entretien"
            pending={pending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setPending(true);
              try {
                const error = await onDelete();
                if (error) setErrors({ form: error });
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
              {edit ? "Enregistrer les modifications" : "Enregistrer l'entretien"}
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
                Supprimer l&apos;entretien
              </Button>
            ) : null}
          </>
        )}
      </SheetFooter>
    </SheetForm>
  );
}
