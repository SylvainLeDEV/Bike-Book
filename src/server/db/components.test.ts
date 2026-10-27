import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import {
  createBike,
  createComponent,
  getComponent,
  listComponents,
  listMaintenanceEvents,
  replaceComponent,
  undoReplacement,
  updateComponent,
  type AccessContext,
  type BikeData,
  type ComponentData,
  type ReplacementData,
} from "./index";

const T = (iso: string) => Date.parse(iso);

const bike: BikeData = {
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
  purchasedOn: "2024-03-14",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2024-03-14",
  salePriceCents: null,
  notes: null,
};

const chain: ComponentData = {
  brand: "SRAM",
  model: "GX Eagle",
  reference: null,
  origin: "stock",
  installedAt: T("2024-03-13T23:00:00Z"),
  initialDistanceM: 0,
  initialWearS: 0,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  warrantyEndsOn: null,
  notes: null,
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

function addChain(ctx: AccessContext, bikeId: number) {
  const outcome = createComponent(ctx, bikeId, { typeCode: "chain", position: "none" }, chain);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.componentId;
}

const replacement = (removedComponentId: number): ReplacementData => ({
  removedComponentId,
  on: "2025-06-06",
  recordedAt: T("2025-06-10T10:00:00Z"),
  at: T("2025-06-06T21:59:59.999Z"),
  reason: "worn",
  removalNote: "allongement 0,6 %",
  newPart: { brand: "SRAM", model: "GX Eagle T-Type", priceCents: 4490 },
  eventTitle: "Chaîne remplacée",
});

describe("components", () => {
  it("adds a part to a bike and reads it back", () => {
    const { ctx, bikeId } = setup("Camille");
    const id = addChain(ctx, bikeId);
    expect(getComponent(ctx, id)).toMatchObject({
      bikeId,
      typeCode: "chain",
      position: "none",
      origin: "stock",
      installedAt: chain.installedAt,
      removedAt: null,
    });
    expect(listComponents(ctx, bikeId).map((c) => c.id)).toEqual([id]);
  });

  it("refuses a second part in a single slot and a position the type does not have", () => {
    const { ctx, bikeId } = setup("Alex");
    addChain(ctx, bikeId);
    expect(createComponent(ctx, bikeId, { typeCode: "chain", position: "none" }, chain)).toEqual({
      ok: false,
      reason: "slot_taken",
      takenBy: "SRAM GX Eagle",
    });
    expect(createComponent(ctx, bikeId, { typeCode: "chain", position: "front" }, chain)).toEqual({
      ok: false,
      reason: "invalid_position",
    });
    expect(createComponent(ctx, bikeId, { typeCode: "tire", position: "none" }, chain)).toEqual({
      ok: false,
      reason: "invalid_position",
    });
    // Front and rear are two slots; "other" takes as many parts as needed.
    const tire = { typeCode: "tire" as const };
    expect(createComponent(ctx, bikeId, { ...tire, position: "front" }, chain).ok).toBe(true);
    expect(createComponent(ctx, bikeId, { ...tire, position: "rear" }, chain).ok).toBe(true);
    const other = { typeCode: "other" as const, position: "none" as const };
    expect(createComponent(ctx, bikeId, other, chain).ok).toBe(true);
    expect(createComponent(ctx, bikeId, other, chain).ok).toBe(true);
  });

  it("updates a part and its shop", () => {
    const { ctx, bikeId } = setup("Sam");
    const id = addChain(ctx, bikeId);
    updateComponent(ctx, id, {
      ...chain,
      model: "XX Eagle",
      shop: { name: "Rayon Libre", kind: "online" },
    });
    expect(getComponent(ctx, id)).toMatchObject({
      model: "XX Eagle",
      shop: { name: "Rayon Libre", kind: "online" },
    });
  });

  it("replaces a part in one transaction: removal, new part, event and item", () => {
    const { ctx, bikeId } = setup("Dom");
    const oldId = addChain(ctx, bikeId);
    const outcome = replaceComponent(ctx, replacement(oldId));
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(getComponent(ctx, oldId)).toMatchObject({
      removedAt: T("2025-06-06T21:59:59.999Z"),
      removalReason: "worn",
      removalNote: "allongement 0,6 %",
    });
    expect(getComponent(ctx, outcome.newComponentId)).toMatchObject({
      origin: "replacement",
      replacesComponentId: oldId,
      installedAt: T("2025-06-06T21:59:59.999Z"),
      model: "GX Eagle T-Type",
      purchasePriceCents: 4490,
    });
    const [event] = listMaintenanceEvents(ctx, bikeId);
    expect(event).toMatchObject({
      performedOn: "2025-06-06",
      title: "Chaîne remplacée",
      performedBy: "self",
      createdAt: T("2025-06-10T10:00:00Z"),
      items: [{ action: "replaced", componentId: oldId, costCents: 4490 }],
    });
    // The removed part cannot be replaced again, nor before it was fitted.
    expect(replaceComponent(ctx, replacement(oldId))).toEqual({
      ok: false,
      reason: "already_removed",
    });
    expect(
      replaceComponent(ctx, { ...replacement(outcome.newComponentId), at: T("2025-01-01T00:00Z") }),
    ).toMatchObject({ ok: false, reason: "before_fitting" });
  });

  it("undoes a replacement as a whole, and refuses once something was built on it", () => {
    const { ctx, bikeId } = setup("Undo");
    const oldId = addChain(ctx, bikeId);
    const first = replaceComponent(ctx, replacement(oldId));
    if (!first.ok) throw new Error(first.reason);

    expect(undoReplacement(ctx, first.itemId)).toEqual({ ok: true });
    expect(listComponents(ctx, bikeId)).toHaveLength(1);
    expect(getComponent(ctx, oldId)).toMatchObject({ removedAt: null, removalReason: null });
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);
    expect(undoReplacement(ctx, first.itemId)).toEqual({ ok: false, reason: "not_found" });

    const again = replaceComponent(ctx, replacement(oldId));
    if (!again.ok) throw new Error(again.reason);
    const later = replaceComponent(ctx, {
      ...replacement(again.newComponentId),
      on: "2026-10-12",
      at: T("2026-10-12T21:59:59.999Z"),
    });
    expect(later.ok).toBe(true);
    expect(undoReplacement(ctx, again.itemId)).toEqual({ ok: false, reason: "too_late" });
  });

  it("adds a second replacement to an event of the same bike, and undo keeps the event", () => {
    const { ctx, bikeId } = setup("Attach");
    const chainId = addChain(ctx, bikeId);
    const padsOutcome = createComponent(
      ctx,
      bikeId,
      { typeCode: "brake_pads", position: "front" },
      { ...chain, model: "Organiques" },
    );
    if (!padsOutcome.ok) throw new Error(padsOutcome.reason);
    const first = replaceComponent(ctx, {
      ...replacement(chainId),
      eventTitle: "Chaîne et plaquettes avant remplacées",
    });
    if (!first.ok) throw new Error(first.reason);
    const second = replaceComponent(ctx, {
      ...replacement(padsOutcome.componentId),
      newPart: { brand: "SRAM", model: "Organiques", priceCents: 2200 },
      eventId: first.eventId,
    });
    if (!second.ok) throw new Error(second.reason);
    expect(second.eventId).toBe(first.eventId);
    expect(listMaintenanceEvents(ctx, bikeId)[0].items).toHaveLength(2);

    expect(undoReplacement(ctx, second.itemId)).toEqual({ ok: true });
    expect(listMaintenanceEvents(ctx, bikeId)[0].items).toHaveLength(1);

    const { ctx: other, bikeId: otherBike } = setup("Other garage");
    const theirs = addChain(other, otherBike);
    expect(replaceComponent(other, { ...replacement(theirs), eventId: first.eventId })).toEqual({
      ok: false,
      reason: "event_not_found",
    });
  });

  it("keeps each workspace's parts and maintenance to itself", () => {
    const { ctx: owner, bikeId } = setup("Owner");
    const { ctx: intruder } = setup("Intruder");
    const id = addChain(owner, bikeId);
    const replaced = replaceComponent(owner, replacement(id));
    if (!replaced.ok) throw new Error(replaced.reason);

    expect(listComponents(intruder, bikeId)).toEqual([]);
    expect(getComponent(intruder, id)).toBeNull();
    expect(listMaintenanceEvents(intruder, bikeId)).toEqual([]);
    expect(listMaintenanceEvents(intruder, null)).toEqual([]);
    expect(
      createComponent(intruder, bikeId, { typeCode: "fork", position: "none" }, chain),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(updateComponent(intruder, replaced.newComponentId, { ...chain, model: "X" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(replaceComponent(intruder, replacement(replaced.newComponentId))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(undoReplacement(intruder, replaced.itemId)).toEqual({ ok: false, reason: "not_found" });
    expect(listComponents(owner, bikeId)).toHaveLength(2);
  });
});
