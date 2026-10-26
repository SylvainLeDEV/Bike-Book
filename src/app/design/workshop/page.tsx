"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { AddItemSheet, type AddItemPrefill } from "@/components/workshop/add-item-sheet";
import { ReplacePartSheet } from "@/components/workshop/replace-part-sheet";
import { WorkshopScreen, type WorkshopActions } from "@/components/workshop/workshop-screen";
import { formatStock } from "@/lib/display";
import type { InventoryItemVM, MovementVM, RebuyState } from "@/lib/view-models";
import {
  BIKES,
  COMPONENT_TYPES,
  REPLACE_ON_SPECTRAL,
  SPECTRAL,
  TODAY,
  WORKSHOP,
} from "../fixtures";

/** Restocking first, else low stock: what the list shows (D-35, computed, D-39). */
function stateOf(item: InventoryItemVM): RebuyState | null {
  if (item.restock.status !== "none") return item.restock.status;
  return item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
    ? "low_stock"
    : null;
}

let nextId = 1000;

/**
 * /design workshop: stock moves and restocking change local state, each with an undo toast.
 * `?empty` shows the guided empty workshop.
 */
export default function DesignWorkshopPage() {
  const params = useSearchParams();
  const toast = useToast();
  const [items, setItems] = React.useState<InventoryItemVM[]>(
    params.has("empty") ? [] : WORKSHOP.items,
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<AddItemPrefill | null>(null);
  const [mountItem, setMountItem] = React.useState<number | null>(null);

  /** Applies a change and offers to undo it by restoring the previous list. */
  function change(update: (list: InventoryItemVM[]) => InventoryItemVM[], message: string) {
    const before = items;
    setItems(update(items).map((it) => ({ ...it, state: stateOf(it) })));
    toast(message, {
      undo: () => {
        setItems(before);
        toast("Modification annulée");
      },
    });
  }

  const updateItem =
    (id: number, fn: (item: InventoryItemVM) => InventoryItemVM) => (list: InventoryItemVM[]) =>
      list.map((it) => (it.id === id ? fn(it) : it));

  const movement = (fields: Omit<MovementVM, "id" | "occurredOn">): MovementVM => ({
    id: nextId++,
    occurredOn: TODAY,
    ...fields,
  });

  const later = (what: string) => () => toast(`${what} : arrive avec la fonctionnalité 8`);

  const actions: WorkshopActions = {
    onMove: (item, delta) => {
      const quantity = item.quantity + delta;
      change(
        updateItem(item.id, (it) => ({
          ...it,
          quantity,
          movements: [
            movement(
              delta < 0
                ? {
                    kind: "use",
                    quantityDelta: -1,
                    source: "Hors entretien",
                    detail: "Noté depuis la fiche",
                    maintenance: null,
                  }
                : {
                    kind: "purchase",
                    quantityDelta: 1,
                    source: "Depuis la fiche",
                    detail: "Prix non noté",
                    maintenance: null,
                  },
            ),
            ...it.movements,
          ],
        })),
        `${delta < 0 ? "Utilisation notée" : "Achat noté"} · ${item.name} : ${formatStock(quantity, item.unit)}`,
      );
    },
    onRestock: (item, to, quantity) => {
      if (to === "to_order")
        return change(
          updateItem(item.id, (it) => ({
            ...it,
            restock: {
              status: "to_order",
              quantity,
              changedOn: TODAY,
              orderedOn: null,
              shopName: null,
            },
          })),
          `À commander : ${item.name}`,
        );
      if (to === "ordered") {
        const shop = item.purchaseLinks.find((l) => l.priceCents != null)?.shopName ?? null;
        return change(
          updateItem(item.id, (it) => ({
            ...it,
            restock: {
              ...it.restock,
              status: "ordered",
              quantity,
              orderedOn: TODAY,
              shopName: shop,
            },
          })),
          `En commande : ${item.name}`,
        );
      }
      if (to === "received") {
        const total = item.quantity + quantity;
        return change(
          updateItem(item.id, (it) => ({
            ...it,
            quantity: total,
            restock: {
              status: "none",
              quantity: null,
              changedOn: null,
              orderedOn: null,
              shopName: null,
            },
            movements: [
              movement({
                kind: "purchase",
                quantityDelta: quantity,
                source: it.restock.shopName,
                detail: null,
                maintenance: null,
              }),
              ...it.movements,
            ],
          })),
          `Réception notée · ${item.name} : ${formatStock(total, item.unit)}`,
        );
      }
      return change(
        updateItem(item.id, (it) => ({
          ...it,
          restock: {
            status: "none",
            quantity: null,
            changedOn: null,
            orderedOn: null,
            shopName: null,
          },
        })),
        `Rachat annulé : ${item.name}`,
      );
    },
    onMount: (item, bike) => {
      if (bike.id !== SPECTRAL.id)
        return toast(`Sur /design, seul le Spectral a sa feuille de remplacement`);
      setMountItem(item.id);
    },
    onAddItem: (suggestion) => {
      setPrefill(suggestion ? { name: suggestion } : null);
      setAddOpen(true);
    },
    onEdit: later("Modifier l'objet"),
    onEditThreshold: later("Modifier le seuil d'alerte"),
    onCorrectStock: later("Corriger le stock après un comptage"),
    onEditBikes: later("Choisir les vélos"),
    onAddLink: later("Ajouter un lien d'achat"),
    onAddPhoto: () => toast("Photo de l'objet : arrive avec les pièces jointes"),
    onArchive: (item) =>
      toast(`Objet archivé : ${item.name}`, { undo: () => toast("Archivage annulé") }),
  };

  const tab = params.get("tab") === "rebuy" ? "rebuy" : "parts";
  const itemId = Number(params.get("item")) || null;
  const bikeId = Number(params.get("bike")) || null;

  return (
    <>
      <WorkshopScreen
        vm={{ ...WORKSHOP, items }}
        actions={actions}
        bikeHref={() => "/design/bike"}
        initial={{ tab, itemId, bikeId }}
      />
      <AddItemSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        bikes={BIKES}
        componentTypes={COMPONENT_TYPES}
        prefill={prefill}
        onSubmit={(input) => {
          const id = nextId++;
          const bikes =
            input.bikes === "all"
              ? "all"
              : BIKES.filter((b) => (input.bikes as number[]).includes(b.id));
          const created: InventoryItemVM = {
            id,
            kind: "part",
            name: input.name,
            brand: input.brand,
            reference: input.reference,
            category: input.category,
            componentTypeCode: input.componentTypeCode,
            bikes,
            location: input.location,
            quantity: input.quantity,
            unit: input.unit,
            lowStockThreshold: input.lowStockThreshold,
            lastUnitCostCents: input.link?.priceCents ?? null,
            state: null,
            restock: {
              status: "none",
              quantity: null,
              changedOn: null,
              orderedOn: null,
              shopName: null,
            },
            purchaseLinks: input.link
              ? [
                  {
                    id: nextId++,
                    shopName:
                      input.link.shopName ??
                      (input.link.url ? new URL(input.link.url).host : "Boutique"),
                    shopKind: input.link.url ? "online" : "physical",
                    url: input.link.url,
                    priceCents: input.link.priceCents,
                    lastPurchasedOn: null,
                    priceNotedOn: TODAY,
                  },
                ]
              : [],
            rulesServed: [],
            lastUse: null,
            movements: input.quantity
              ? [
                  movement({
                    kind: "initial",
                    quantityDelta: input.quantity,
                    source: null,
                    detail: "Saisi à la création de l'objet",
                    maintenance: null,
                  }),
                ]
              : [],
            notes: input.notes,
          };
          change((list) => [...list, created], `Nouvel objet dans l'atelier : ${input.name}`);
        }}
      />
      <ReplacePartSheet
        vm={{ ...REPLACE_ON_SPECTRAL, stock: items }}
        open={mountItem !== null}
        onOpenChange={(open) => !open && setMountItem(null)}
        initialItemId={mountItem}
        onSubmit={(input, item) => {
          if (!item) return toast("Remplacement noté · pièce saisie à la main");
          change(
            updateItem(item.id, (it) => ({
              ...it,
              quantity: it.quantity - 1,
              movements: [
                movement({
                  kind: "use",
                  quantityDelta: -1,
                  source: "Spectral",
                  detail: null,
                  maintenance: { bikeId: 1, title: "Pièce remplacée" },
                }),
                ...it.movements,
              ],
            })),
            `Pièce remplacée sur le Spectral · stock : ${formatStock(item.quantity - 1, item.unit)}`,
          );
        }}
      />
    </>
  );
}
