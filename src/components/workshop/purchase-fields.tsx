"use client";

import * as React from "react";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { formatDecimal, type LocalDate } from "@/lib/format";
import { parseMoneyInput } from "@/lib/parse";
import type { PurchaseSourceInput } from "@/lib/view-models";

/*
 * What a purchase says (D-111): the unit price paid and where it was bought (one of the item's
 * links, another shop typed by name, or not said). Shared by "Reçu" and "Modifier le mouvement".
 */

export type PurchaseLinkOption = { id: number; shopName: string; priceCents: number | null };

/** The fields as typed: `shop` is "link:<id>", "new" (another shop) or "" (not said). */
export type PurchaseDraft = { price: string; shop: string; newShop: string };

const priceText = (cents: number | null | undefined) =>
  cents != null ? formatDecimal(cents / 100, 2) : "";

/** A draft from what is known: a price and the link it went through. */
export function purchaseDraft(
  unitCostCents: number | null | undefined,
  linkId: number | null | undefined,
): PurchaseDraft {
  return {
    price: priceText(unitCostCents),
    shop: linkId != null ? `link:${linkId}` : "",
    newShop: "",
  };
}

/** The draft read back, or the first thing to fix. */
export function readPurchaseDraft(
  draft: PurchaseDraft,
):
  | { ok: true; unitCostCents: number | null; source: PurchaseSourceInput }
  | { ok: false; error: string } {
  const unitCostCents = parseMoneyInput(draft.price);
  if (unitCostCents != null && Number.isNaN(unitCostCents)) {
    return { ok: false, error: "Prix invalide." };
  }
  if (draft.shop === "new") {
    const name = draft.newShop.trim();
    if (!name) return { ok: false, error: "Indique la boutique." };
    return { ok: true, unitCostCents, source: { shopName: name } };
  }
  const linkId = draft.shop.startsWith("link:") ? Number(draft.shop.slice(5)) : null;
  return { ok: true, unitCostCents, source: linkId ? { linkId } : null };
}

/** The shop of a draft in words, for a summary line; null when not said. */
export function draftShopName(draft: PurchaseDraft, links: PurchaseLinkOption[]): string | null {
  if (draft.shop === "new") return draft.newShop.trim() || null;
  const linkId = draft.shop.startsWith("link:") ? Number(draft.shop.slice(5)) : null;
  return links.find((link) => link.id === linkId)?.shopName ?? null;
}

/** "Prix payé" and "Boutique"; choosing a link fills an empty price with the link's. */
export function PurchaseFields({
  draft,
  onChange,
  links,
  priceLabel = "Prix payé (l'unité)",
}: {
  draft: PurchaseDraft;
  onChange: (draft: PurchaseDraft) => void;
  links: PurchaseLinkOption[];
  priceLabel?: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={priceLabel}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            suffix="€"
            value={draft.price}
            onChange={(e) => onChange({ ...draft, price: e.target.value })}
          />
        </Field>
        <Field label="Boutique">
          <NativeSelect
            value={draft.shop}
            onChange={(e) => {
              const shop = e.target.value;
              const link = links.find((l) => `link:${l.id}` === shop);
              onChange({
                ...draft,
                shop,
                price: draft.price.trim() || !link ? draft.price : priceText(link.priceCents),
              });
            }}
          >
            <option value="">Non précisée</option>
            {links.map((link) => (
              <option key={link.id} value={`link:${link.id}`}>
                {link.shopName}
              </option>
            ))}
            <option value="new">Autre boutique…</option>
          </NativeSelect>
        </Field>
      </div>
      {draft.shop === "new" ? (
        <Field
          label="Nom de la boutique"
          hint="Ajoutée aux liens d'achat de l'objet, avec ce prix."
        >
          <Input
            autoComplete="off"
            placeholder="Ex. Decathlon"
            value={draft.newShop}
            autoFocus
            onChange={(e) => onChange({ ...draft, newShop: e.target.value })}
          />
        </Field>
      ) : null}
    </>
  );
}

/** "Acheté le", "Reçu le": a day of the past or today. */
export function DayField({
  label,
  value,
  today,
  onChange,
  hint,
}: {
  label: string;
  value: LocalDate;
  today: LocalDate;
  onChange: (day: LocalDate) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input type="date" max={today} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
