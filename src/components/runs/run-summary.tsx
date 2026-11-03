"use client";

import * as React from "react";
import { Camera, CircleAlert, Replace, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { ReplacePartSheet } from "@/components/workshop/replace-part-sheet";
import { formatStock } from "@/lib/display";
import { MAINTENANCE_LINE_ACTIONS } from "@/lib/enums";
import { formatCount } from "@/lib/format";
import { MAINTENANCE_ACTION_LABELS, PRODUCT_LEVEL_LABELS } from "@/lib/labels";
import { decimalText, parseMoneyInput } from "@/lib/parse";
import { levelsAfter, partsCostCents, uncheckedSteps, uncheckedText } from "@/lib/runs";
import type { MaintenanceAction } from "@/lib/enums";
import type { FinishRunInput, ProductLevel, RunSummaryVM, RunVM } from "@/lib/view-models";
import type { RunActions } from "./run-screen";

type LineAction = Exclude<MaintenanceAction, "replaced">;

function Section({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card asChild padded>
      <section aria-labelledby={id} className="grid gap-3">
        <h3
          id={id}
          className="flex items-center gap-2 eyebrow [&_svg]:size-[15px] [&_svg]:text-fg-muted"
        >
          {icon}
          {title}
        </h3>
        {children}
      </section>
    </Card>
  );
}

/**
 * The summary before "Enregistrer l'entretien" (D-82, D-87): nothing is written before it. The
 * event (date, title, one line: action, part, rule reset), the workshop's stock (parts taken,
 * products' level after), cost, time spent and a note, the photos; "Remplacer une pièce" goes
 * through its own sheet and the run's line joins its event. A general task's run only marks the
 * task done.
 */
export function RunSummary({
  vm,
  summary,
  onReplace,
  onFinish,
}: {
  vm: RunVM;
  summary: RunSummaryVM;
  onReplace?: RunActions["onReplace"];
  onFinish: RunActions["onFinish"];
}) {
  const [performedOn, setPerformedOn] = React.useState(summary.today);
  const [title, setTitle] = React.useState(vm.title);
  const [action, setAction] = React.useState<LineAction>("serviced");
  const [componentId, setComponentId] = React.useState(
    summary.defaultComponentId == null ? "" : String(summary.defaultComponentId),
  );
  const [ruleId, setRuleId] = React.useState(
    summary.defaultRuleId == null ? "" : String(summary.defaultRuleId),
  );
  const [quantities, setQuantities] = React.useState<Record<number, number>>(() =>
    Object.fromEntries(summary.parts.map((part) => [part.itemId, part.defaultQuantity])),
  );
  const [levels, setLevels] = React.useState<Record<number, ProductLevel>>(() =>
    Object.fromEntries(summary.products.map((p) => [p.itemId, p.defaultLevel])),
  );
  const computedCost = partsCostCents(summary.parts, quantities);
  const [costText, setCostText] = React.useState<string | null>(null);
  const [hours, setHours] = React.useState(
    summary.laborMinutes == null ? "" : String(Math.floor(summary.laborMinutes / 60)),
  );
  const [minutes, setMinutes] = React.useState(
    summary.laborMinutes == null ? "" : String(summary.laborMinutes % 60),
  );
  const [notes, setNotes] = React.useState("");
  const [saveAsProcedure, setSaveAsProcedure] = React.useState(false);
  const [joinEventId, setJoinEventId] = React.useState<number | null>(null);
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const unchecked = uncheckedText(uncheckedSteps(vm.steps));
  const photoCount = vm.steps.reduce((sum, step) => sum + step.photoCount, 0);
  const costShown = costText ?? (computedCost == null ? "" : decimalText(computedCost / 100, 2));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cost = parseMoneyInput(costShown);
    if (cost != null && Number.isNaN(cost)) return setError("Coût invalide.");
    const h = hours.trim() ? Number.parseInt(hours, 10) : 0;
    const m = minutes.trim() ? Number.parseInt(minutes, 10) : 0;
    if (Number.isNaN(h) || Number.isNaN(m)) return setError("Temps passé invalide.");
    const input: FinishRunInput = {
      performedOn,
      title: title.trim(),
      notes: notes.trim() || null,
      laborMinutes: h * 60 + m > 0 ? h * 60 + m : null,
      action,
      componentId: componentId ? Number(componentId) : null,
      ruleId: ruleId ? Number(ruleId) : null,
      costCents: cost,
      joinEventId,
      parts: summary.parts.map((part) => ({
        itemId: part.itemId,
        quantity: quantities[part.itemId] ?? 0,
      })),
      products: summary.products.map((product) => ({
        itemId: product.itemId,
        levelAfter: levels[product.itemId] ?? product.level,
      })),
      saveAsProcedure,
    };
    setError(null);
    setPending(true);
    const message = await onFinish(input).catch(
      () => "Enregistrement impossible. Vérifie la connexion et réessaie.",
    );
    setPending(false);
    setError(message);
  }

  return (
    <>
      <form id="run-summary" onSubmit={submit} className="grid gap-4" aria-busy={pending}>
        <div>
          <h2 className="text-[22px] leading-tight font-[650]">Récapitulatif</h2>
          <p className="mt-1 hint">
            Voici ce qui sera enregistré. Rien n&apos;est écrit avant «{" "}
            {summary.writesEvent ? "Enregistrer l'entretien" : "Marquer la tâche faite"} ».
          </p>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {unchecked ? (
          <Card
            padded
            role="note"
            className="flex items-start gap-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-[18px] [&>svg]:shrink-0"
          >
            <CircleAlert aria-hidden />
            <p>{unchecked} Tu peux enregistrer quand même, ou y revenir.</p>
          </Card>
        ) : null}

        {summary.writesEvent ? (
          <>
            <Section
              id="sum-event"
              title="Entretien dans l'historique"
              icon={<Wrench aria-hidden />}
            >
              <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                <Field label="Date">
                  <Input
                    type="date"
                    value={performedOn}
                    max={summary.today}
                    onChange={(e) => setPerformedOn(e.target.value)}
                  />
                </Field>
                <Field label="Titre">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2">
                <Field label="Action">
                  <NativeSelect
                    value={action}
                    onChange={(e) => setAction(e.target.value as LineAction)}
                  >
                    {MAINTENANCE_LINE_ACTIONS.map((value) => (
                      <option key={value} value={value}>
                        {MAINTENANCE_ACTION_LABELS[value]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Pièce">
                  <NativeSelect
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                  >
                    <option value="">Le vélo entier</option>
                    {summary.components.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field
                label="Règle remise à zéro"
                hint={vm.context?.startsWith("Tâche") ? "La tâche sera marquée faite." : undefined}
              >
                <NativeSelect value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
                  <option value="">Aucune</option>
                  {summary.rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.slot ? `${rule.title} · ${rule.slot}` : rule.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {summary.replace && onReplace ? (
                <div className="grid gap-1.5">
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setReplaceOpen(true)}
                    >
                      <Replace />
                      Remplacer une pièce…
                    </Button>
                  </div>
                  <p className="hint">
                    {joinEventId
                      ? "Remplacement noté : cet entretien le rejoint."
                      : "Une pièce changée pendant le travail (chaîne, plaquettes) : son remplacement rejoint cet entretien."}
                  </p>
                </div>
              ) : null}
            </Section>

            {summary.parts.length || summary.products.length ? (
              <Section id="sum-stock" title="Stock de l'atelier" icon={<Wrench aria-hidden />}>
                {summary.parts.map((part) => {
                  const quantity = quantities[part.itemId] ?? 0;
                  return (
                    <div
                      key={part.itemId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span id={`sum-part-${part.itemId}`} className="min-w-0 text-[14.5px]">
                        {part.name}
                        <span className="hint">
                          {" "}
                          · {formatStock(part.inStock, part.unit)} en stock
                        </span>
                      </span>
                      <span
                        role="group"
                        aria-labelledby={`sum-part-${part.itemId}`}
                        className="flex items-center gap-2"
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          aria-label="1 de moins"
                          disabled={quantity <= 0}
                          onClick={() =>
                            setQuantities((q) => ({ ...q, [part.itemId]: quantity - 1 }))
                          }
                        >
                          −
                        </Button>
                        <span
                          className="min-w-12 text-center num text-lg font-semibold"
                          aria-live="polite"
                        >
                          −{quantity}
                          <span className="sr-only"> à retirer</span>
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          aria-label="1 de plus"
                          disabled={quantity >= part.inStock}
                          onClick={() =>
                            setQuantities((q) => ({ ...q, [part.itemId]: quantity + 1 }))
                          }
                        >
                          +
                        </Button>
                      </span>
                    </div>
                  );
                })}
                {summary.products.map((product) => (
                  <Field
                    key={product.itemId}
                    label={product.name}
                    hint={`Niveau du ${product.container[0]} après l'entretien.`}
                  >
                    <NativeSelect
                      value={levels[product.itemId]}
                      onChange={(e) =>
                        setLevels((l) => ({
                          ...l,
                          [product.itemId]: e.target.value as ProductLevel,
                        }))
                      }
                    >
                      {levelsAfter(product.level).map((level) => (
                        <option key={level} value={level}>
                          {PRODUCT_LEVEL_LABELS[level]}
                          {level === product.level ? " (inchangé)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ))}
                <p className="hint">Les outils ne bougent pas.</p>
              </Section>
            ) : null}

            <Section id="sum-cost" title="Coût et temps passé" icon={<Wrench aria-hidden />}>
              <div className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-3">
                <Field
                  label="Coût"
                  hint="Pièces au dernier prix d'achat."
                  className="col-span-2 md:col-span-1"
                >
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    suffix="€"
                    value={costShown}
                    onChange={(e) => setCostText(e.target.value)}
                  />
                </Field>
                <Field label="Heures">
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    suffix="h"
                    value={hours}
                    onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Minutes">
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    suffix="min"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>
              <p className="-mt-1 hint">
                {summary.laborMinutes
                  ? "Prérempli avec la durée de la fiche : corrige-le."
                  : "Le temps passé, si tu veux le garder."}
              </p>
            </Section>
          </>
        ) : (
          <Card padded className="text-sm">
            La tâche « {vm.context?.replace(/^Tâche : /, "") ?? vm.title} » sera marquée faite. Une
            tâche générale n&apos;écrit pas d&apos;entretien : le suivi et ses photos restent
            accessibles depuis la tâche (« Voir le suivi »).
          </Card>
        )}

        <Field label="Note" hint="Facultative.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {photoCount ? (
          <p className="flex items-center gap-2 hint [&_svg]:size-4">
            <Camera aria-hidden />
            {formatCount(photoCount, "photo", "photos")} du suivi,{" "}
            {summary.writesEvent
              ? "visibles avec l'entretien et dans la galerie du vélo."
              : "visibles sur la tâche."}
          </p>
        ) : null}

        {vm.procedure == null && vm.steps.length ? (
          <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--brand)]"
              checked={saveAsProcedure}
              onChange={(e) => setSaveAsProcedure(e.target.checked)}
            />
            Enregistrer ces étapes comme une fiche d&apos;entretien
          </label>
        ) : null}
      </form>
      {/* Outside the form: a submit in the sheet must not bubble (React) to "Enregistrer". */}
      {summary.replace && onReplace ? (
        <ReplacePartSheet
          vm={summary.replace}
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          onSubmit={async (input, item) => {
            const result = await onReplace(input, item);
            if (!result.ok) return result;
            // Same day: the run's line joins the replacement's event (D-63, D-87).
            if (result.eventId != null && input.on === performedOn) setJoinEventId(result.eventId);
            // A part taken from the stock by the replacement is not taken twice (D-87).
            if (item) setQuantities((q) => (item.id in q ? { ...q, [item.id]: 0 } : q));
          }}
        />
      ) : null}
    </>
  );
}
