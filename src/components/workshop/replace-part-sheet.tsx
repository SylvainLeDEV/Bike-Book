"use client";

import * as React from "react";
import { Check, ChevronRight, Info, PackageMinus, Pencil } from "lucide-react";
import { CATEGORY_ICONS } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatQuantity, formatStock } from "@/lib/display";
import { REMOVAL_REASON_CHOICES } from "@/lib/labels";
import { parseMoneyInput } from "@/lib/parse";
import type { InventoryItemVM, ReplacePartInput, ReplacePartVM } from "@/lib/view-models";

/*
 * "Remplacer une pièce" (D-33, D-38, D-43): the removed part, why, then the new part taken from
 * the workshop first; the effect on the stock is spelled out before saving.
 */

type Reason = ReplacePartInput["reason"];

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

function servesBike(item: InventoryItemVM, bikeId: number) {
  return item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId);
}

export function ReplacePartSheet({
  vm,
  open,
  onOpenChange,
  initialItemId,
  onSubmit,
}: {
  vm: ReplacePartVM;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from a workshop item ("Monter sur …"): that item is chosen. */
  initialItemId?: number | null;
  /** Saves; an `{ ok: false }` answer keeps the sheet open with its message. */
  onSubmit: (
    input: ReplacePartInput,
    item: InventoryItemVM | null,
  ) => void | Promise<void | { ok: false; error: string }>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Remplacer une pièce" description={vm.bike.name}>
        {open ? (
          <ReplaceForm
            vm={vm}
            initialItemId={initialItemId ?? null}
            onSubmit={async (input, item) => {
              const result = await onSubmit(input, item);
              if (result && !result.ok) return result.error;
              onOpenChange(false);
              return null;
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ReplaceForm({
  vm,
  initialItemId,
  onSubmit,
}: {
  vm: ReplacePartVM;
  initialItemId: number | null;
  /** Resolves with an error message, or null once saved. */
  onSubmit: (input: ReplacePartInput, item: InventoryItemVM | null) => Promise<string | null>;
}) {
  const initialItem = vm.stock.find((it) => it.id === initialItemId) ?? null;
  const firstSlot =
    vm.slots.find((slot) => slot.componentTypeCode === initialItem?.componentTypeCode) ??
    vm.slots[0];
  const [slotId, setSlotId] = React.useState(firstSlot?.componentId ?? 0);
  const [reason, setReason] = React.useState<Reason>("worn");
  const [note, setNote] = React.useState("");
  const [on, setOn] = React.useState(vm.today);
  const [eventId, setEventId] = React.useState<number | null>(null);
  const sameDay = (vm.events ?? []).filter((event) => event.on === on);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const slot = vm.slots.find((s) => s.componentId === slotId) ?? firstSlot;

  const candidates = vm.stock.filter(
    (item) => item.componentTypeCode === slot?.componentTypeCode && servesBike(item, vm.bike.id),
  );
  const firstUsable = (list: InventoryItemVM[], prefer?: number | null) =>
    list.find((it) => it.id === prefer && it.quantity > 0) ?? list.find((it) => it.quantity > 0);

  const [choice, setChoice] = React.useState<number | "other">(
    firstUsable(candidates, initialItemId)?.id ?? "other",
  );
  const chosen =
    typeof choice === "number" ? (vm.stock.find((it) => it.id === choice) ?? null) : null;
  const [brand, setBrand] = React.useState(chosen?.brand ?? "");
  const [model, setModel] = React.useState(chosen?.name ?? "");
  const [price, setPrice] = React.useState(centsToInput(chosen?.lastUnitCostCents ?? null));
  const [detailsOpen, setDetailsOpen] = React.useState(chosen === null);
  const [modelError, setModelError] = React.useState<string | null>(null);
  const modelRef = React.useRef<HTMLInputElement>(null);

  function pick(next: number | "other") {
    setChoice(next);
    const item = typeof next === "number" ? (vm.stock.find((it) => it.id === next) ?? null) : null;
    setBrand(item?.brand ?? "");
    setModel(item?.name ?? "");
    setPrice(centsToInput(item?.lastUnitCostCents ?? null));
    setDetailsOpen(item === null);
    setModelError(null);
  }

  function changeSlot(id: number) {
    setSlotId(id);
    const nextSlot = vm.slots.find((s) => s.componentId === id);
    const list = vm.stock.filter(
      (item) =>
        item.componentTypeCode === nextSlot?.componentTypeCode && servesBike(item, vm.bike.id),
    );
    pick(firstUsable(list)?.id ?? "other");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) return;
    const priceCents = parseMoneyInput(price);
    const badPrice = priceCents != null && Number.isNaN(priceCents);
    setPriceError(badPrice ? "Montant invalide." : null);
    if (!model.trim() || badPrice) {
      setDetailsOpen(true);
      if (!model.trim()) setModelError("Indique le modèle de la pièce montée.");
      requestAnimationFrame(() => modelRef.current?.focus());
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      const error = await onSubmit(
        {
          removedComponentId: slot.componentId,
          on: on || vm.today,
          eventId: sameDay.some((event) => event.id === eventId) ? eventId : null,
          reason,
          removalNote: note.trim() || null,
          fromItemId: chosen?.id ?? null,
          brand: brand.trim() || null,
          model: model.trim(),
          priceCents,
        },
        chosen,
      );
      setFormError(error);
    } catch {
      setFormError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  const after = chosen ? chosen.quantity - 1 : 0;
  const lowAfter = chosen && chosen.lowStockThreshold != null && after <= chosen.lowStockThreshold;

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Fieldset legend="Pièce retirée">
          <ChipRow scroll className="-mx-5 px-5">
            {vm.slots.map((s) => (
              <Chip
                key={s.componentId}
                name="slot"
                value={s.componentId}
                checked={s.componentId === slotId}
                data-autofocus={s.componentId === slotId ? "" : undefined}
                onChange={() => changeSlot(s.componentId)}
              >
                {s.label}
              </Chip>
            ))}
          </ChipRow>
          {slot ? (
            <p className="hint">
              Montée aujourd&apos;hui : {slot.fitted.model} · {formatQuantity(slot.fitted.counter)}
            </p>
          ) : null}
        </Fieldset>

        <Fieldset legend="Raison">
          <ChipRow scroll className="-mx-5 px-5">
            {(Object.keys(REMOVAL_REASON_CHOICES) as Reason[]).map((value) => (
              <Chip
                key={value}
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
              >
                {REMOVAL_REASON_CHOICES[value]}
              </Chip>
            ))}
          </ChipRow>
          <Field label="Précision" hint="Facultatif, gardé dans la fiche d'origine.">
            <Input
              autoComplete="off"
              placeholder="Ex. chape tordue aux Gets"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </Fieldset>

        <Field
          label="Date du remplacement"
          hint="Une date passée complète l'historique : les sorties de ce jour-là restent sur l'ancienne pièce."
        >
          <Input
            type="date"
            max={vm.today}
            value={on}
            onChange={(e) => {
              setOn(e.target.value);
              setEventId(null);
            }}
          />
        </Field>
        {sameDay.length ? (
          <Field label="Entretien" hint="Un entretien existe déjà ce jour-là sur ce vélo.">
            <NativeSelect
              value={eventId ?? ""}
              onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nouvel entretien</option>
              {sameDay.map((event) => (
                <option key={event.id} value={event.id}>
                  Ajouter à « {event.title} »
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}

        <Fieldset legend="Pièce montée" hint="d'abord ce qui est dans l'atelier">
          <div className="grid gap-2">
            {candidates.map((item) => {
              const Icon = CATEGORY_ICONS[item.category];
              return (
                <ChoiceCard
                  key={item.id}
                  name="newPart"
                  value={item.id}
                  checked={choice === item.id}
                  disabled={item.quantity === 0}
                  onChange={() => pick(item.id)}
                  icon={<Icon aria-hidden />}
                  title={item.name}
                  meta={[
                    item.brand,
                    `${formatStock(item.quantity, item.unit)} en stock`,
                    item.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })}
            {candidates.length ? null : (
              <p className="hint">
                Rien dans l&apos;atelier pour ce type de pièce. Ajoute-la à l&apos;atelier pour la
                retrouver ici la prochaine fois.
              </p>
            )}
            <ChoiceCard
              name="newPart"
              value="other"
              checked={choice === "other"}
              onChange={() => pick("other")}
              icon={<Pencil aria-hidden />}
              title="Autre pièce, hors atelier"
              meta="Saisie à la main, le stock ne change pas"
            />
          </div>
        </Fieldset>

        <div className="rounded-card bg-brand-soft p-3.5">
          <p className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-brand-ink [&_svg]:mt-px [&_svg]:size-5 [&_svg]:shrink-0">
            {chosen ? (
              <>
                <PackageMinus aria-hidden />
                <span>
                  Le stock passe de {formatStock(chosen.quantity, chosen.unit)} à{" "}
                  {formatStock(after, chosen.unit)}
                  {chosen.state === "low_stock"
                    ? " : il est déjà en « Stock bas », pense à le racheter"
                    : lowAfter
                      ? " : il passera en « Stock bas » sur l'accueil"
                      : ""}
                  . La pièce montée reprend la marque, le modèle et le prix du dernier achat.
                </span>
              </>
            ) : (
              <>
                <Info aria-hidden />
                <span>
                  Pièce saisie à la main : l&apos;atelier ne bouge pas. Tu pourras l&apos;y ajouter
                  ensuite pour suivre son stock.
                </span>
              </>
            )}
          </p>
        </div>

        <details
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          className="group border-t border-border pt-1"
        >
          <summary className="flex min-h-11 list-none items-center gap-2 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-[18px] transition-transform group-open:rotate-90"
              aria-hidden
            />
            Détails de la pièce montée
            <span className="hint">{chosen ? "préremplis depuis l'atelier" : "à remplir"}</span>
          </summary>
          <div className="grid gap-4 pt-1.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Marque">
                <Input
                  autoComplete="off"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </Field>
              <Field label="Prix payé" error={priceError}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  suffix="€"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Modèle" error={modelError}>
              <Input
                ref={modelRef}
                autoComplete="off"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setModelError(null);
                }}
              />
            </Field>
          </div>
        </details>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending || !slot}>
          <Check />
          Enregistrer le remplacement
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
