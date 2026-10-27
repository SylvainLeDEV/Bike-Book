import { describe, expect, it } from "vitest";
import { stockQuantity } from "@/server/domain/inventory";
import { createTestContext } from "@/test/context";
import {
  addMovement,
  addPurchaseLink,
  createBike,
  createComponent,
  createItem,
  getComponent,
  listInventory,
  receiveItem,
  replaceComponent,
  setItemArchived,
  setRestock,
  undoMovement,
  undoReceive,
  undoReplacement,
  updateItem,
  type AccessContext,
  type BikeData,
} from "./index";

const bike = {
  name: "Spectral",
  discipline: "enduro",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: null,
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: null,
  salePriceCents: null,
  notes: null,
} satisfies BikeData;

const NOW = Date.parse("2026-10-25T10:00:00Z");

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

function pads(ctx: AccessContext, bikeId: number, initialQuantity = 2) {
  const created = createItem(ctx, {
    name: "Plaquettes Maven organiques",
    brand: "SRAM",
    reference: "00.5318.031.000",
    category: "brakes",
    componentTypeCode: "brake_pads",
    allBikes: false,
    bikeIds: [bikeId],
    unit: "pair",
    lowStockThreshold: 1,
    location: "Établi, tiroir 2",
    notes: null,
    initialQuantity,
    link: {
      shop: { name: "Rayon Libre", kind: "online" },
      url: "https://shop.example.com/pads",
      priceCents: 2200,
    },
    at: NOW,
    today: "2026-10-25",
  });
  if (!created.ok) throw new Error(created.reason);
  return created.itemId;
}

const item = (ctx: AccessContext, id: number) => listInventory(ctx).find((i) => i.id === id)!;

describe("workshop", () => {
  it("creates a part with its bikes, first stock and purchase link", () => {
    const { ctx, bikeId } = setup("Camille");
    const id = pads(ctx, bikeId);
    const created = item(ctx, id);
    expect(created).toMatchObject({
      kind: "part",
      unit: "pair",
      bikeIds: [bikeId],
      restockStatus: "none",
      links: [
        {
          shop: { name: "Rayon Libre", kind: "online" },
          url: "https://shop.example.com/pads",
          priceCents: 2200,
          priceNotedOn: "2026-10-25",
        },
      ],
      movements: [{ kind: "initial", quantityDelta: 2 }],
    });
    expect(stockQuantity(created.movements)).toBe(2);
  });

  it("moves the stock by movements only, and undoes a movement", () => {
    const { ctx, bikeId } = setup("Alex");
    const id = pads(ctx, bikeId);
    const used = addMovement(ctx, id, {
      kind: "use",
      quantityDelta: -1,
      unitCostCents: null,
      note: null,
      at: NOW,
    });
    if (!used.ok) throw new Error(used.reason);
    addMovement(ctx, id, {
      kind: "adjustment",
      quantityDelta: 3,
      unitCostCents: null,
      note: "Comptage",
      at: NOW,
    });
    expect(stockQuantity(item(ctx, id).movements)).toBe(4);
    expect(undoMovement(ctx, used.movementId)).toEqual({ ok: true });
    expect(stockQuantity(item(ctx, id).movements)).toBe(5);
  });

  it("restocks: to order, ordered, received with the quantity confirmed, and undo", () => {
    const { ctx, bikeId } = setup("Sam");
    const id = pads(ctx, bikeId, 0);
    setRestock(ctx, id, { status: "to_order", quantity: 2, changedOn: "2026-10-20" });
    const ordered = setRestock(ctx, id, {
      status: "ordered",
      quantity: 3,
      changedOn: "2026-10-22",
    });
    expect(ordered).toEqual({
      ok: true,
      previous: { status: "to_order", quantity: 2, changedOn: "2026-10-20" },
    });
    const received = receiveItem(ctx, id, {
      quantity: 2,
      unitCostCents: 2100,
      purchaseLinkId: null,
      at: NOW,
    });
    if (!received.ok) throw new Error(received.reason);
    expect(item(ctx, id)).toMatchObject({ restockStatus: "none", restockQuantity: null });
    expect(stockQuantity(item(ctx, id).movements)).toBe(2);

    expect(undoReceive(ctx, id, received.movementId, received.previous)).toEqual({ ok: true });
    expect(item(ctx, id)).toMatchObject({
      restockStatus: "ordered",
      restockQuantity: 3,
      restockChangedOn: "2026-10-22",
    });
    expect(stockQuantity(item(ctx, id).movements)).toBe(0);
  });

  it("updates, archives and links an item", () => {
    const { ctx, bikeId } = setup("Dom");
    const id = pads(ctx, bikeId);
    updateItem(ctx, id, {
      name: "Plaquettes Maven",
      brand: "SRAM",
      reference: null,
      category: "brakes",
      componentTypeCode: "brake_pads",
      allBikes: true,
      bikeIds: [bikeId],
      unit: "pair",
      lowStockThreshold: 2,
      location: null,
      notes: null,
    });
    expect(item(ctx, id)).toMatchObject({
      name: "Plaquettes Maven",
      allBikes: true,
      bikeIds: [],
      lowStockThreshold: 2,
    });
    addPurchaseLink(ctx, id, {
      shop: { name: "Cycles du Lac", kind: "physical" },
      url: null,
      priceCents: 2500,
      notedOn: "2026-10-25",
    });
    expect(item(ctx, id).links).toHaveLength(2);
    setItemArchived(ctx, id, NOW);
    expect(item(ctx, id).archivedAt).toBe(NOW);
  });

  it("replaces a part from stock in one transaction, undone as a whole", () => {
    const { ctx, bikeId } = setup("Stock");
    const id = pads(ctx, bikeId, 1);
    const fitted = createComponent(
      ctx,
      bikeId,
      { typeCode: "brake_pads", position: "front" },
      {
        brand: "SRAM",
        model: "Organiques",
        reference: null,
        origin: "stock",
        installedAt: Date.parse("2024-03-13T23:00:00Z"),
        initialDistanceM: 0,
        initialWearS: 0,
        purchasedOn: null,
        purchasePriceCents: null,
        shop: null,
        warrantyEndsOn: null,
        notes: null,
      },
    );
    if (!fitted.ok) throw new Error(fitted.reason);
    const replacement = {
      removedComponentId: fitted.componentId,
      on: "2026-10-25",
      recordedAt: NOW,
      at: NOW,
      reason: "worn" as const,
      removalNote: null,
      newPart: { brand: "SRAM", model: "Plaquettes Maven organiques", priceCents: 2200 },
      fromItemId: id,
      eventTitle: "Plaquettes avant remplacées",
    };
    const done = replaceComponent(ctx, replacement);
    if (!done.ok) throw new Error(done.reason);
    expect(getComponent(ctx, done.newComponentId)?.removedAt).toBeNull();
    expect(item(ctx, id).movements.at(-1)).toMatchObject({
      kind: "use",
      quantityDelta: -1,
      unitCostCents: 2200,
      maintenanceItemId: done.itemId,
      maintenance: { bikeId, eventTitle: "Plaquettes avant remplacées" },
    });
    expect(stockQuantity(item(ctx, id).movements)).toBe(0);
    // A movement of a replacement only goes with the replacement.
    expect(undoMovement(ctx, item(ctx, id).movements.at(-1)!.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    // Nothing left: the next replacement from that item is refused.
    expect(
      replaceComponent(ctx, { ...replacement, removedComponentId: done.newComponentId }),
    ).toEqual({
      ok: false,
      reason: "out_of_stock",
    });

    expect(undoReplacement(ctx, done.itemId)).toEqual({ ok: true });
    expect(stockQuantity(item(ctx, id).movements)).toBe(1);
    expect(getComponent(ctx, fitted.componentId)?.removedAt).toBeNull();
  });

  it("keeps each workspace's workshop to itself", () => {
    const { ctx: owner, bikeId } = setup("Owner");
    const { ctx: intruder, bikeId: theirBike } = setup("Intruder");
    const id = pads(owner, bikeId);
    const move = {
      kind: "use" as const,
      quantityDelta: -1,
      unitCostCents: null,
      note: null,
      at: NOW,
    };
    expect(listInventory(intruder)).toEqual([]);
    expect(addMovement(intruder, id, move)).toEqual({ ok: false, reason: "not_found" });
    expect(setRestock(intruder, id, { status: "to_order", quantity: 1, changedOn: null })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      receiveItem(intruder, id, {
        quantity: 1,
        unitCostCents: null,
        purchaseLinkId: null,
        at: NOW,
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(setItemArchived(intruder, id, NOW)).toEqual({ ok: false, reason: "not_found" });
    expect(
      addPurchaseLink(intruder, id, {
        shop: null,
        url: "https://x.example",
        priceCents: null,
        notedOn: "2026-10-25",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    const ownMove = addMovement(owner, id, move);
    if (!ownMove.ok) throw new Error(ownMove.reason);
    expect(undoMovement(intruder, ownMove.movementId)).toEqual({ ok: false, reason: "not_found" });
    // Another workspace cannot attach its item to my bike, nor take my stock for its bike.
    expect(
      createItem(intruder, {
        name: "X",
        brand: null,
        reference: null,
        category: "other",
        componentTypeCode: null,
        allBikes: false,
        bikeIds: [bikeId],
        unit: "piece",
        lowStockThreshold: null,
        location: null,
        notes: null,
        initialQuantity: 0,
        link: null,
        at: NOW,
        today: "2026-10-25",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    const theirs = createComponent(
      intruder,
      theirBike,
      { typeCode: "chain", position: "none" },
      {
        brand: null,
        model: "X",
        reference: null,
        origin: "stock",
        installedAt: 0,
        initialDistanceM: 0,
        initialWearS: 0,
        purchasedOn: null,
        purchasePriceCents: null,
        shop: null,
        warrantyEndsOn: null,
        notes: null,
      },
    );
    if (!theirs.ok) throw new Error(theirs.reason);
    expect(
      replaceComponent(intruder, {
        removedComponentId: theirs.componentId,
        on: "2026-10-25",
        recordedAt: NOW,
        at: NOW,
        reason: "worn",
        removalNote: null,
        newPart: { brand: null, model: "Y", priceCents: null },
        fromItemId: id,
        eventTitle: "Chaîne remplacée",
      }),
    ).toEqual({ ok: false, reason: "item_not_found" });
    expect(stockQuantity(item(owner, id).movements)).toBe(1);
  });
});
