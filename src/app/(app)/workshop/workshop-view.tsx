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
import {
  addLinkAction,
  archiveItemAction,
  correctStockAction,
  moveItemAction,
  restockAction,
  saveItemAction,
  undoWorkshopAction,
  type UndoToken,
} from "@/server/actions/workshop";

/** The current values of an item, for "Modifier l'objet". */
function valuesOf(item: InventoryItemVM): AddItemInput {
  return {
    name: item.name,
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    componentTypeCode: item.componentTypeCode,
    bikes: item.bikes === "all" ? "all" : item.bikes.map((bike) => bike.id),
    quantity: item.quantity,
    unit: item.unit,
    lowStockThreshold: item.lowStockThreshold,
    location: item.location,
    link: null,
    notes: item.notes,
  };
}

export function WorkshopView({
  vm,
  componentTypes,
  initial,
}: {
  vm: WorkshopVM;
  componentTypes: ComponentTypeOption[];
  initial: { tab: "parts" | "rebuy"; bikeId: number | null; itemId: number | null };
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
    onRestock: async (item, to, quantity) => withUndo(await restockAction(item.id, to, quantity)),
    // The replace sheet lives on the bike page: open it there with this item chosen.
    onMount: (item, bike) => router.push(`/bikes/${bike.id}?replace=${item.id}`),
    onAddItem: (suggestion) =>
      setSheet({ open: true, prefill: suggestion ? { name: suggestion } : null, editing: null }),
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
