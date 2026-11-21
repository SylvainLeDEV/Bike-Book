"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Trash2, Wrench } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatDate, type LocalDate } from "@/lib/format";
import type { HistoryItemVM, MovementEditInput, WorkshopHistoryEntryVM } from "@/lib/view-models";
import { defaultPurchaseLink, movementSummary } from "@/lib/workshop-history";
import { DayField, PurchaseFields, purchaseDraft, readPurchaseDraft } from "./purchase-fields";

/*
 * "Modifier le mouvement" (D-111), from the workshop's history or an item's page: the day, the
 * note; a purchase's unit price and shop; an addition ("Stock initial") marked as bought. A
 * movement made by maintenance changes with its event. "Supprimer le mouvement" for a mistake,
 * confirmed in the footer (D-70).
 */

type Submit<T> = (input: T) => Promise<string | null>;

function titleOf(entry: WorkshopHistoryEntryVM): string {
  if (entry.maintenance) return "Mouvement d'un entretien";
  if (entry.kind === "purchase") return "Modifier l'achat";
  if (entry.kind === "initial") return "Modifier l'ajout";
  return "Modifier le mouvement";
}

export function MovementSheet({
  entry,
  item,
  today,
  onOpenChange,
  onSubmit,
  onDelete,
  eventHref,
}: {
  /** The movement; null closes the sheet. */
  entry: WorkshopHistoryEntryVM | null;
  item: HistoryItemVM | null;
  today: LocalDate;
  onOpenChange: (open: boolean) => void;
  onSubmit: Submit<MovementEditInput>;
  /** Resolves to an error message, or null once deleted. */
  onDelete: () => Promise<string | null>;
  eventHref: (bikeId: number, eventId: number) => string;
}) {
  const open = entry != null && item != null;
  // The last movement stays shown while the sheet closes (state adjusted while rendering).
  const [shown, setShown] = React.useState<{
    entry: WorkshopHistoryEntryVM;
    item: HistoryItemVM;
  } | null>(null);
  if (entry && item && (shown?.entry !== entry || shown?.item !== item)) {
    setShown({ entry, item });
  }
  const current = entry && item ? { entry, item } : shown;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={current ? titleOf(current.entry) : "Mouvement"}
        description={
          current
            ? `${current.item.name}${current.item.archived ? " (archivé)" : ""} · ${formatDate(current.entry.on, { year: "auto", today })}`
            : undefined
        }
      >
        {current ? (
          current.entry.maintenance ? (
            <FromMaintenance entry={current.entry} item={current.item} eventHref={eventHref} />
          ) : (
            <MovementForm
              key={current.entry.id}
              entry={current.entry}
              item={current.item}
              today={today}
              onSubmit={onSubmit}
              onDelete={onDelete}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FromMaintenance({
  entry,
  item,
  eventHref,
}: {
  entry: WorkshopHistoryEntryVM;
  item: HistoryItemVM;
  eventHref: (bikeId: number, eventId: number) => string;
}) {
  const maintenance = entry.maintenance!;
  return (
    <SheetBody>
      <p className="text-[15px] font-medium">{movementSummary(item, entry)}</p>
      <Card padded className="grid gap-2">
        <p className="flex items-start gap-2 text-sm">
          <Wrench className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          <span>
            Noté par l&apos;entretien « {maintenance.title} » : il se modifie ou se supprime depuis
            l&apos;entretien, qui rend le stock s&apos;il est supprimé.
          </span>
        </p>
        {maintenance.eventId != null ? (
          <div>
            <Button variant="secondary" size="sm" asChild>
              <Link href={eventHref(maintenance.bikeId, maintenance.eventId)}>
                Voir l&apos;entretien
              </Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </SheetBody>
  );
}

function MovementForm({
  entry,
  item,
  today,
  onSubmit,
  onDelete,
}: {
  entry: WorkshopHistoryEntryVM;
  item: HistoryItemVM;
  today: LocalDate;
  onSubmit: Submit<MovementEditInput>;
  onDelete: () => Promise<string | null>;
}) {
  const canBuy = entry.kind === "initial" && entry.quantityDelta > 0;
  const [asPurchase, setAsPurchase] = React.useState(false);
  const [on, setOn] = React.useState<LocalDate>(entry.on);
  const [note, setNote] = React.useState(entry.detail ?? "");
  const [draft, setDraft] = React.useState(() =>
    purchaseDraft(entry.unitCostCents, entry.purchaseLinkId),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const isPurchase = entry.kind === "purchase" || asPurchase;

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setPending(true);
    try {
      setError(await action());
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm
      onSubmit={(event) => {
        event.preventDefault();
        if (!on || on > today) {
          setError("Indique une date passée ou aujourd'hui.");
          return;
        }
        const purchase = isPurchase ? readPurchaseDraft(draft) : null;
        if (purchase && !purchase.ok) {
          setError(purchase.error);
          return;
        }
        void run(() =>
          onSubmit({
            on,
            note: note.trim() || null,
            asPurchase,
            unitCostCents: purchase?.ok ? purchase.unitCostCents : null,
            source: purchase?.ok ? purchase.source : null,
          }),
        );
      }}
    >
      <SheetBody>
        {error ? <FieldError>{error}</FieldError> : null}
        <p className="text-[15px] font-medium">{movementSummary(item, entry)}</p>
        {canBuy ? (
          <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--brand)]"
              checked={asPurchase}
              onChange={(e) => {
                setAsPurchase(e.target.checked);
                // Nothing typed yet: the item's usual link and its price (D-111).
                const link = defaultPurchaseLink(item.links);
                if (e.target.checked && link && !draft.shop && !draft.price.trim()) {
                  setDraft(purchaseDraft(link.priceCents, link.id));
                }
              }}
            />
            Je l&apos;ai acheté : noter la date, le prix et la boutique
          </label>
        ) : null}
        <DayField
          label={isPurchase ? "Acheté le" : entry.kind === "initial" ? "Ajouté le" : "Date"}
          value={on}
          today={today}
          onChange={setOn}
          hint={
            asPurchase
              ? "Le stock ne bouge pas : cet ajout devient un achat de la même quantité."
              : undefined
          }
        />
        {isPurchase ? (
          <PurchaseFields draft={draft} onChange={setDraft} links={item.links} />
        ) : null}
        <Field label="Note">
          <Textarea
            value={note}
            maxLength={500}
            placeholder="Ex. commande groupée, promo, cadeau…"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </SheetBody>
      <SheetFooter className="grid gap-2">
        {confirmDelete ? (
          <DeleteConfirm
            question="Supprimer ce mouvement ? Le stock est recalculé sans lui ; à réserver à une erreur de saisie."
            confirmLabel="Supprimer le mouvement"
            pending={pending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              await run(onDelete);
              setConfirmDelete(false);
            }}
          />
        ) : (
          <>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <Check />
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-late-ink hover:text-late-ink"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Supprimer le mouvement
            </Button>
          </>
        )}
      </SheetFooter>
    </SheetForm>
  );
}
