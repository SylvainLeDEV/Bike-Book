"use client";

import * as React from "react";
import { Calculator, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { RuleStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatQuantity } from "@/lib/display";
import { formatCount, formatDate, formatEta, formatPercent } from "@/lib/format";
import { decimalText, parseDecimalInput } from "@/lib/parse";
import type { RuleFormVM, RuleInput, RulesSheetVM, SaveRuleResult } from "@/lib/view-models";

/*
 * "Règles d'entretien" of a bike (feature 6): the list, then one rule's form with how its figures
 * were computed (principle 2). Intervals are suggestions to adjust to each part's manual.
 */

const SOURCE_LABELS = {
  maintenance: "dernier entretien",
  replacement: "montage de la pièce actuelle",
  start: "début du compteur",
} as const;

function intervalsText(
  rule: Pick<RuleInput, "intervalDistanceM" | "intervalWearS" | "intervalDays">,
) {
  return [
    rule.intervalDistanceM != null
      ? formatQuantity({ unit: "distance_m", value: rule.intervalDistanceM })
      : null,
    rule.intervalWearS != null
      ? formatQuantity({ unit: "duration_s", value: rule.intervalWearS })
      : null,
    rule.intervalDays != null ? formatQuantity({ unit: "days", value: rule.intervalDays }) : null,
  ]
    .filter(Boolean)
    .join(" ou ");
}

export function RulesSheet({
  open,
  onOpenChange,
  vm,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vm: RulesSheetVM;
  onSubmit: (ruleId: number | null, input: RuleInput) => Promise<SaveRuleResult>;
}) {
  // undefined: the list; null: a new rule; a number: that rule.
  const [editing, setEditing] = React.useState<number | null | undefined>(undefined);
  const rule = editing == null ? null : (vm.rules.find((r) => r.id === editing) ?? null);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setEditing(undefined);
      }}
    >
      <SheetContent
        title={
          editing === undefined
            ? "Règles d'entretien"
            : editing === null
              ? "Nouvelle règle"
              : "Modifier la règle"
        }
        description={vm.bike.name}
      >
        {!open ? null : editing === undefined ? (
          <RulesList vm={vm} onEdit={setEditing} />
        ) : (
          <RuleForm
            key={editing ?? "new"}
            vm={vm}
            rule={rule}
            onBack={() => setEditing(undefined)}
            onSubmit={async (input) => {
              const result = await onSubmit(editing ?? null, input);
              if (result.ok) setEditing(undefined);
              return result.ok ? null : result.error;
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RulesList({ vm, onEdit }: { vm: RulesSheetVM; onEdit: (id: number | null) => void }) {
  const slotLabel = (value: string) => vm.slots.find((slot) => slot.value === value)?.label;
  return (
    <>
      <SheetBody>
        {vm.rules.length ? (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {vm.rules.map((rule) => (
              <li key={rule.id}>
                <button
                  type="button"
                  onClick={() => onEdit(rule.id)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                  aria-label={`Modifier la règle ${rule.title}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{rule.title}</span>
                    <span className="block text-[13px] text-fg-muted">
                      {slotLabel(rule.slot)} · {intervalsText(rule)}
                    </span>
                  </span>
                  {rule.active && rule.status ? (
                    <RuleStatusBadge status={rule.status} />
                  ) : (
                    <Badge variant="outline">Désactivée</Badge>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">
            Aucune règle pour l&apos;instant. Ajoute une pièce pour te voir proposer ses intervalles
            d&apos;entretien, ou crée une règle ici.
          </p>
        )}
      </SheetBody>
      <SheetFooter>
        <Button size="lg" className="w-full" onClick={() => onEdit(null)} data-autofocus="">
          <Plus />
          Nouvelle règle
        </Button>
      </SheetFooter>
    </>
  );
}

function RuleForm({
  vm,
  rule,
  onBack,
  onSubmit,
}: {
  vm: RulesSheetVM;
  rule: RuleFormVM | null;
  onBack: () => void;
  onSubmit: (input: RuleInput) => Promise<string | null>;
}) {
  const [slot, setSlot] = React.useState(rule?.slot ?? "bike");
  const [title, setTitle] = React.useState(rule?.title ?? "");
  const [km, setKm] = React.useState(
    rule?.intervalDistanceM != null ? decimalText(rule.intervalDistanceM / 1000, 1) : "",
  );
  const [hours, setHours] = React.useState(
    rule?.intervalWearS != null ? decimalText(rule.intervalWearS / 3600, 1) : "",
  );
  const [days, setDays] = React.useState(
    rule?.intervalDays != null ? String(rule.intervalDays) : "",
  );
  const [warn, setWarn] = React.useState(String(Math.round((rule?.warnRatio ?? 0.9) * 100)));
  const [resetOnReplacement, setResetOnReplacement] = React.useState(
    rule?.resetOnReplacement ?? true,
  );
  const [lastDoneOn, setLastDoneOn] = React.useState(rule?.lastDoneOn ?? "");
  const [active, setActive] = React.useState(rule?.active ?? true);
  const [notes, setNotes] = React.useState(rule?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const distance = parseDecimalInput(km);
    const wear = parseDecimalInput(hours);
    const dayCount = parseDecimalInput(days);
    const threshold = parseDecimalInput(warn);
    if ([distance, wear, dayCount, threshold].some((n) => n != null && Number.isNaN(n))) {
      setError("Un des nombres saisis n'est pas valide.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      setError(
        await onSubmit({
          slot,
          title: title.trim(),
          intervalDistanceM: distance ? Math.round(distance * 1000) : null,
          intervalWearS: wear ? Math.round(wear * 3600) : null,
          intervalDays: dayCount ? Math.round(dayCount) : null,
          warnRatio: (threshold ?? 90) / 100,
          resetOnReplacement,
          lastDoneOn: lastDoneOn || null,
          active,
          notes: notes.trim() || null,
        }),
      );
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  const explanation = rule?.explanation;
  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        <Button type="button" variant="link" className="justify-self-start" onClick={onBack}>
          <ChevronLeft />
          Toutes les règles
        </Button>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field label="Titre">
          <Input
            autoComplete="off"
            maxLength={120}
            placeholder="Ex. Entretien des bas de fourreaux"
            value={title}
            data-autofocus=""
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="S'applique à">
          <NativeSelect value={slot} onChange={(e) => setSlot(e.target.value)}>
            {vm.slots.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <fieldset className="grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13.5px] leading-tight font-semibold">
            Intervalle <span className="hint">· le premier atteint compte</span>
          </legend>
          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Distance" hideLabel>
              <Input
                inputMode="decimal"
                placeholder="—"
                suffix="km"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </Field>
            <Field label="Heures d'usure" hideLabel>
              <Input
                inputMode="decimal"
                placeholder="—"
                suffix="h"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            <Field label="Jours" hideLabel>
              <Input
                inputMode="numeric"
                placeholder="—"
                suffix="j"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Bientôt dû à" hint="Part de l'intervalle.">
            <Input
              inputMode="numeric"
              suffix="%"
              value={warn}
              onChange={(e) => setWarn(e.target.value)}
            />
          </Field>
          <Field label="Fait pour la dernière fois le" hint="Facultatif.">
            <Input
              type="date"
              max={vm.today}
              value={lastDoneOn}
              onChange={(e) => setLastDoneOn(e.target.value)}
            />
          </Field>
        </div>
        {slot !== "bike" ? (
          <label className="flex min-h-9 items-center gap-2.5 text-[14px] pointer-coarse:min-h-11">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--brand)]"
              checked={resetOnReplacement}
              onChange={(e) => setResetOnReplacement(e.target.checked)}
            />
            Repart de zéro quand la pièce est remplacée
          </label>
        ) : null}
        {rule ? (
          <label className="flex min-h-9 items-center gap-2.5 text-[14px] pointer-coarse:min-h-11">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--brand)]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Règle active (décoche pour la mettre de côté sans la perdre)
          </label>
        ) : null}
        <Field label="Notes">
          <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {explanation ? (
          <div className="rounded-control bg-surface-2 px-3 py-2.5 text-[13.5px]">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <Calculator className="size-4" aria-hidden />
              Calcul
            </p>
            <p className="text-fg-muted">
              Depuis le {formatDate(explanation.since)} ({SOURCE_LABELS[explanation.source]}) :{" "}
              {formatCount(explanation.rideCount, "sortie", "sorties")},{" "}
              {formatQuantity({ unit: "distance_m", value: explanation.distanceM })},{" "}
              {formatQuantity({ unit: "duration_s", value: explanation.wearS })} d&apos;usure,{" "}
              {formatQuantity({ unit: "days", value: explanation.days })}, soit{" "}
              {formatPercent(explanation.ratio)} de l&apos;intervalle.
              {explanation.etaDays != null
                ? ` Échéance ${formatEta(explanation.etaDays)} au rythme des 8 dernières semaines (estimation).`
                : ""}
            </p>
          </div>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          {rule ? "Enregistrer" : "Créer la règle"}
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
