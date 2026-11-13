"use client";

import * as React from "react";
import { Check, Trash2 } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatItemStock } from "@/lib/display";
import { formatDecimal } from "@/lib/format";
import { parseMoneyInput } from "@/lib/parse";
import type { InventoryItemVM, PurchaseLinkVM } from "@/lib/view-models";

/*
 * The workshop item's small sheets (feature 8): "Corriger le stock" after a count of a part's
 * units or a product's containers (the difference becomes an adjustment movement, D-39, D-85)
 * and the link sheet: "Ajouter un lien d'achat" (shown, never fetched, D-09), "Modifier le lien
 * d'achat" (D-106).
 */

/** What a count is about: a part's units, a product's containers; tools are not counted. */
function countedNow(item: InventoryItemVM): { value: number; label: string } | null {
  if (item.kind === "part") return { value: item.quantity, label: "Quantité comptée" };
  if (item.kind === "product") {
    return { value: item.containers, label: `Nombre de ${item.container[1]}` };
  }
  return null;
}

type Submit<T> = (input: T) => Promise<string | null>;

function useSubmit<T>(onSubmit: Submit<T>) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const run = async (input: T) => {
    setError(null);
    setPending(true);
    try {
      setError(await onSubmit(input));
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  };
  return { error, setError, pending, run };
}

export function CorrectStockSheet({
  item,
  onOpenChange,
  onSubmit,
}: {
  /** The item being counted; null closes the sheet. */
  item: InventoryItemVM | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: Submit<number>;
}) {
  return (
    <Sheet open={item != null} onOpenChange={onOpenChange}>
      <SheetContent
        title="Corriger le stock"
        description={item ? `${item.name} · aujourd'hui ${formatItemStock(item)}` : undefined}
      >
        {item ? <CorrectStockForm key={item.id} item={item} onSubmit={onSubmit} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function CorrectStockForm({ item, onSubmit }: { item: InventoryItemVM; onSubmit: Submit<number> }) {
  const now = countedNow(item);
  const [counted, setCounted] = React.useState(String(now?.value ?? 0));
  const { error, setError, pending, run } = useSubmit(onSubmit);
  return (
    <SheetForm
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number.parseInt(counted, 10);
        if (!/^\d+$/.test(counted.trim()) || value > 10_000) {
          setError("Indique le nombre compté.");
          return;
        }
        void run(value);
      }}
    >
      <SheetBody>
        <Field
          label={now?.label ?? "Quantité comptée"}
          hint="La différence est notée comme une correction ; l'historique reste."
          error={error}
        >
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={counted}
            data-autofocus=""
            onChange={(e) => setCounted(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          Corriger
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}

export type LinkInput = { shopName: string | null; url: string | null; priceCents: number | null };

/**
 * "Ajouter un lien d'achat" and, with `link`, "Modifier le lien d'achat" with "Supprimer le
 * lien" confirmed in the footer (D-106, D-70).
 */
export function LinkSheet({
  item,
  link,
  onOpenChange,
  onSubmit,
  onDelete,
}: {
  /** The item; null closes the sheet. */
  item: InventoryItemVM | null;
  /** The link being edited; null adds one. */
  link: PurchaseLinkVM | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: Submit<LinkInput>;
  /** Resolves to an error message, or null once deleted. */
  onDelete: () => Promise<string | null>;
}) {
  return (
    <Sheet open={item != null} onOpenChange={onOpenChange}>
      <SheetContent
        title={link ? "Modifier le lien d'achat" : "Ajouter un lien d'achat"}
        description={item?.name}
      >
        {item ? (
          <LinkForm
            key={`${item.id}-${link?.id ?? "new"}`}
            link={link}
            onSubmit={onSubmit}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function LinkForm({
  link,
  onSubmit,
  onDelete,
}: {
  link: PurchaseLinkVM | null;
  onSubmit: Submit<LinkInput>;
  onDelete: () => Promise<string | null>;
}) {
  const [shopName, setShopName] = React.useState(link?.shop ?? "");
  const [url, setUrl] = React.useState(link?.url ?? "");
  const [price, setPrice] = React.useState(
    link?.priceCents != null ? formatDecimal(link.priceCents / 100, 2) : "",
  );
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { error, setError, pending, run } = useSubmit(onSubmit);
  const remove = useSubmit(onDelete);
  return (
    <SheetForm
      onSubmit={(event) => {
        event.preventDefault();
        const priceCents = parseMoneyInput(price);
        if (!shopName.trim() && !url.trim()) {
          setError("Indique la boutique ou l'adresse de la page.");
          return;
        }
        if (priceCents != null && Number.isNaN(priceCents)) {
          setError("Prix invalide.");
          return;
        }
        void run({ shopName: shopName.trim() || null, url: url.trim() || null, priceCents });
      }}
    >
      <SheetBody>
        {error || remove.error ? <FieldError>{error ?? remove.error}</FieldError> : null}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Boutique">
            <Input
              autoComplete="off"
              placeholder="Ex. Cycles du Lac"
              value={shopName}
              data-autofocus={link ? undefined : ""}
              onChange={(e) => setShopName(e.target.value)}
            />
          </Field>
          <Field label="Prix">
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              suffix="€"
              value={price}
              data-autofocus={link ? "" : undefined}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Adresse de la page"
          hint="Affichée et ouverte dans un nouvel onglet ; l'application ne la consulte jamais."
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
      </SheetBody>
      <SheetFooter className="grid gap-2">
        {link && confirmDelete ? (
          <DeleteConfirm
            question="Supprimer ce lien d'achat ? Les achats déjà notés gardent leur prix."
            confirmLabel="Supprimer le lien"
            pending={remove.pending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              await remove.run(undefined);
              setConfirmDelete(false);
            }}
          />
        ) : (
          <>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <Check />
              {link ? "Enregistrer" : "Ajouter le lien"}
            </Button>
            {link ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-late-ink hover:text-late-ink"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Supprimer le lien
              </Button>
            ) : null}
          </>
        )}
      </SheetFooter>
    </SheetForm>
  );
}
