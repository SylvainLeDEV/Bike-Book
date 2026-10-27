"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatStock } from "@/lib/display";
import { parseMoneyInput } from "@/lib/parse";
import type { InventoryItemVM } from "@/lib/view-models";

/*
 * The workshop item's small sheets (feature 8): "Corriger le stock" after a count (the difference
 * becomes an adjustment movement, D-39) and "Ajouter un lien d'achat" (shown, never fetched, D-09).
 */

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
        description={
          item ? `${item.name} · aujourd'hui ${formatStock(item.quantity, item.unit)}` : undefined
        }
      >
        {item ? <CorrectStockForm key={item.id} item={item} onSubmit={onSubmit} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function CorrectStockForm({ item, onSubmit }: { item: InventoryItemVM; onSubmit: Submit<number> }) {
  const [counted, setCounted] = React.useState(String(item.quantity));
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
          label="Quantité comptée"
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

export function AddLinkSheet({
  item,
  onOpenChange,
  onSubmit,
}: {
  item: InventoryItemVM | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: Submit<LinkInput>;
}) {
  return (
    <Sheet open={item != null} onOpenChange={onOpenChange}>
      <SheetContent title="Ajouter un lien d'achat" description={item?.name}>
        {item ? <AddLinkForm key={item.id} onSubmit={onSubmit} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function AddLinkForm({ onSubmit }: { onSubmit: Submit<LinkInput> }) {
  const [shopName, setShopName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [price, setPrice] = React.useState("");
  const { error, setError, pending, run } = useSubmit(onSubmit);
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
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Boutique">
            <Input
              autoComplete="off"
              placeholder="Ex. Cycles du Lac"
              value={shopName}
              data-autofocus=""
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
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          Ajouter le lien
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
