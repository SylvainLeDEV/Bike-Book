"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { AddItemSheet, type AddItemPrefill } from "@/components/workshop/add-item-sheet";
import { AddLinkSheet, CorrectStockSheet } from "@/components/workshop/item-sheets";
import { WorkshopScreen, type WorkshopActions } from "@/components/workshop/workshop-screen";
import type {
  AddItemInput,
  ComponentTypeOption,
  InventoryItemVM,
  WorkshopVM,
} from "@/lib/view-models";
import type { WorkshopView as WorkshopAddress } from "@/lib/workshop-filter";
import {
  addLinkAction,
  archiveItemAction,
  correctStockAction,
  moveItemAction,
  restockAction,
  saveItemAction,
  setLevelAction,
  setOwnedAction,
  undoWorkshopAction,
  type UndoToken,
} from "@/server/actions/workshop";

/** The current values of an item, for "Modifier l'objet" (its kind never changes). */
function valuesOf(item: InventoryItemVM): AddItemInput {
  const common = {
    name: item.name,
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    componentTypeCode: item.componentTypeCode,
    bikes: item.bikes === "all" ? ("all" as const) : item.bikes.map((bike) => bike.id),
    location: item.location,
    link: null,
    notes: item.notes,
  };
  switch (item.kind) {
    case "part":
      return {
        ...common,
        kind: item.kind,
        quantity: item.quantity,
        unit: item.unit,
        lowStockThreshold: item.lowStockThreshold,
      };
    case "product":
      return {
        ...common,
        kind: item.kind,
        containers: item.containers,
        level: item.level === "empty" ? "full" : item.level,
        containerLabel: item.containerLabel ?? null,
      };
    case "tool":
      return { ...common, kind: item.kind, owned: item.owned };
  }
}

export function WorkshopView({
  vm,
  componentTypes,
  initial,
}: {
  vm: WorkshopVM;
  componentTypes: ComponentTypeOption[];
  initial: WorkshopAddress;
}) {
  const toast = useToast();
  const router = useRouter();
  const [sheet, setSheet] = React.useState<{
    open: boolean;
    prefill: AddItemPrefill | null;
    editing: { id: number; values: AddItemInput } | null;
  }>({ open: false, prefill: null, editing: null });
  const [counting, setCounting] = React.useState<InventoryItemVM | null>(null);
  const [linking, setLinking] = React.useState<InventoryItemVM | null>(null);

  /** A change with "Annuler" (D-60). */
  const withUndo = (
    result: { ok: true; message: string; undo: UndoToken | null } | { ok: false; error: string },
  ) => {
    if (!result.ok) return toast(result.error);
    const undo = result.undo;
    toast(
      result.message,
      undo ? { undo: async () => toast((await undoWorkshopAction(undo)).message) } : {},
    );
  };
  const edit = (item: InventoryItemVM) =>
    setSheet({ open: true, prefill: null, editing: { id: item.id, values: valuesOf(item) } });

  const actions: WorkshopActions = {
    onMove: async (item, delta) => withUndo(await moveItemAction(item.id, delta)),
    onSetLevel: async (item, level) => withUndo(await setLevelAction(item.id, level)),
    onSetOwned: async (item, owned) => withUndo(await setOwnedAction(item.id, owned)),
    onRestock: async (item, to, quantity) => withUndo(await restockAction(item.id, to, quantity)),
    // The replace sheet lives on the bike page: open it there with this item chosen.
    onMount: (item, bike) => router.push(`/bikes/${bike.id}?replace=${item.id}`),
    onAddItem: (prefill) => setSheet({ open: true, prefill: prefill ?? null, editing: null }),
    onEdit: edit,
    onEditThreshold: edit,
    onEditBikes: edit,
    onCorrectStock: setCounting,
    onAddLink: setLinking,
    onArchive: async (item) => withUndo(await archiveItemAction(item.id)),
  };

  return (
    <>
      {/* The screen has its own top bar: "‹ Atelier" when an item replaces the list. */}
      <WorkshopScreen
        vm={vm}
        actions={actions}
        bikeHref={(bikeId) => `/bikes/${bikeId}`}
        initial={initial}
      />
      <AddItemSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((state) => ({ ...state, open }))}
        bikes={vm.bikes}
        componentTypes={componentTypes}
        prefill={sheet.prefill}
        editing={sheet.editing?.values ?? null}
        onSubmit={async (input) => {
          const result = await saveItemAction(sheet.editing?.id ?? null, input);
          if (!result.ok) return result;
          toast(result.message);
        }}
      />
      <CorrectStockSheet
        item={counting}
        onOpenChange={(open) => !open && setCounting(null)}
        onSubmit={async (counted) => {
          if (!counting) return null;
          const result = await correctStockAction(counting.id, counted);
          if (!result.ok) return result.error;
          setCounting(null);
          withUndo(result);
          return null;
        }}
      />
      <AddLinkSheet
        item={linking}
        onOpenChange={(open) => !open && setLinking(null)}
        onSubmit={async (link) => {
          if (!linking) return null;
          const result = await addLinkAction(linking.id, link);
          if (!result.ok) return result.error;
          setLinking(null);
          toast(result.message);
          return null;
        }}
      />
    </>
  );
}
