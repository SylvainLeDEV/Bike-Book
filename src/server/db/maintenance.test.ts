import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import {
  createBike,
  createComponent,
  createMaintenanceEvent,
  listComponents,
  listMaintenanceEvents,
  listShops,
  replaceComponent,
  deleteMaintenanceEvent,
  updateMaintenanceEvent,
  type BikeData,
  type ComponentData,
  type MaintenanceEventData,
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

const part: ComponentData = {
  brand: "RockShox",
  model: "Lyrik",
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
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  const fork = createComponent(ctx, created.bikeId, { typeCode: "fork", position: "none" }, part);
  if (!fork.ok) throw new Error("fork");
  return { ctx, bikeId: created.bikeId, forkId: fork.componentId };
}

const event = (bikeId: number, forkId: number): MaintenanceEventData => ({
  bikeId,
  performedOn: "2026-03-02",
  title: "Entretien fourche et amortisseur",
  performedBy: "shop",
  shop: { name: "Cycles du Lac", kind: "physical" },
  totalCostCents: 38_900,
  notes: null,
  recordedAt: Date.parse("2026-03-05T18:00:00Z"),
  lines: [
    {
      action: "serviced",
      componentId: forkId,
      ruleId: null,
      description: "Bas de fourreaux, joints",
      costCents: null,
      measurementValue: null,
      measurementUnit: null,
    },
    {
      action: "inspected",
      componentId: null,
      ruleId: null,
      description: "Serrages",
      costCents: null,
      measurementValue: 0.5,
      measurementUnit: "percent",
    },
  ],
});

const TZ = "Europe/Paris";

/** Replaces a fork on a past day (its last millisecond in Paris); returns the new fork's id. */
function replaceFork(
  ctx: ReturnType<typeof setup>["ctx"],
  removedComponentId: number,
  eventId: number | null,
  on: string,
): number {
  const replaced = replaceComponent(ctx, {
    removedComponentId,
    on,
    recordedAt: Date.parse("2026-03-05T18:00:00Z"),
    at: Date.parse(`${on}T22:59:59.999Z`),
    reason: "worn",
    removalNote: null,
    newPart: { brand: "RockShox", model: "Zeb", priceCents: 90_000 },
    eventTitle: "Fourche remplacée",
    eventId,
  });
  if (!replaced.ok) throw new Error(replaced.reason);
  return replaced.newComponentId;
}

/** The event as "Modifier l'entretien" sends it: no bike, no recording time. */
function edited(bikeId: number, forkId: number) {
  const { performedOn, title, performedBy, shop, totalCostCents, notes, lines } = event(
    bikeId,
    forkId,
  );
  return { performedOn, title, performedBy, shop, totalCostCents, notes, lines };
}

describe("maintenance events", () => {
  it("records an event, its shop and its lines", () => {
    const { ctx, bikeId, forkId } = setup("Camille");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    expect(listMaintenanceEvents(ctx, bikeId)[0]).toMatchObject({
      id: created.eventId,
      performedBy: "shop",
      shop: { name: "Cycles du Lac" },
      totalCostCents: 38_900,
      createdAt: Date.parse("2026-03-05T18:00:00Z"),
      items: [
        { action: "serviced", componentId: forkId },
        { action: "inspected", measurementValue: 0.5, measurementUnit: "percent" },
      ],
    });
    expect(listShops(ctx).map((s) => s.name)).toEqual(["Cycles du Lac"]);
  });

  it("refuses a part of another bike and keeps no shop for work done at home", () => {
    const { ctx, bikeId, forkId } = setup("Alex");
    const other = createBike(ctx, { ...bike, name: "Le Lourd" });
    if (!other.ok) throw new Error("bike");
    expect(createMaintenanceEvent(ctx, event(other.bikeId, forkId))).toEqual({
      ok: false,
      reason: "unknown_part",
    });
    const home = createMaintenanceEvent(ctx, { ...event(bikeId, forkId), performedBy: "self" });
    if (!home.ok) throw new Error(home.reason);
    expect(listMaintenanceEvents(ctx, bikeId)[0].shop).toBeNull();
  });

  it("undoes an event, unless a replacement joined it since", () => {
    const { ctx, bikeId, forkId } = setup("Undo");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    expect(deleteMaintenanceEvent(ctx, created.eventId)).toEqual({ ok: true });
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);

    const again = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!again.ok) throw new Error(again.reason);
    const replaced = replaceComponent(ctx, {
      removedComponentId: forkId,
      on: "2026-03-02",
      recordedAt: Date.parse("2026-03-05T18:00:00Z"),
      at: Date.parse("2026-03-02T22:59:59.999Z"),
      reason: "upgrade",
      removalNote: null,
      newPart: { brand: "RockShox", model: "Zeb", priceCents: 90_000 },
      eventTitle: "Fourche remplacée",
      eventId: again.eventId,
    });
    expect(replaced.ok).toBe(true);
    expect(deleteMaintenanceEvent(ctx, again.eventId, { keepReplacements: true })).toEqual({
      ok: false,
      reason: "too_late",
    });
  });

  it("only joins a replacement to an event of the same day", () => {
    const { ctx, bikeId, forkId } = setup("Day");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    expect(
      replaceComponent(ctx, {
        removedComponentId: forkId,
        on: "2026-03-03",
        recordedAt: Date.parse("2026-03-05T18:00:00Z"),
        at: Date.parse("2026-03-03T22:59:59.999Z"),
        reason: "worn",
        removalNote: null,
        newPart: { brand: null, model: "Zeb", priceCents: null },
        eventTitle: "Fourche remplacée",
        eventId: created.eventId,
      }),
    ).toEqual({ ok: false, reason: "event_not_found" });
  });

  it("edits an event and its lines, keeping its replacements", () => {
    const { ctx, bikeId, forkId } = setup("Edit");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    const base = edited(bikeId, forkId);
    const edit = {
      ...base,
      performedOn: "2026-03-01",
      title: "Révision fourche",
      performedBy: "self" as const,
      shop: { name: "Ignored", kind: "physical" as const },
      totalCostCents: null,
      lines: [{ ...base.lines[0], costCents: 1500 }],
    };
    expect(updateMaintenanceEvent(ctx, created.eventId, edit, TZ)).toEqual({ ok: true });
    const [saved] = listMaintenanceEvents(ctx, bikeId);
    expect(saved).toMatchObject({
      performedOn: "2026-03-01",
      title: "Révision fourche",
      performedBy: "self",
      shop: null,
      totalCostCents: null,
      createdAt: Date.parse("2026-03-05T18:00:00Z"),
    });
    expect(saved.items.map((item) => [item.action, item.costCents])).toEqual([["serviced", 1500]]);

    replaceFork(ctx, forkId, created.eventId, "2026-03-01");
    expect(updateMaintenanceEvent(ctx, created.eventId, { ...edit, lines: [] }, TZ)).toEqual({
      ok: true,
    });
    expect(listMaintenanceEvents(ctx, bikeId)[0].items.map((item) => item.action)).toEqual([
      "replaced",
    ]);
  });

  it("moves its replacements with a new date, within the parts' lives", () => {
    const { ctx, bikeId, forkId } = setup("Move");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    const zebId = replaceFork(ctx, forkId, created.eventId, "2026-03-02");
    const base = edited(bikeId, forkId);

    expect(
      updateMaintenanceEvent(ctx, created.eventId, { ...base, performedOn: "2026-02-20" }, TZ),
    ).toEqual({ ok: true });
    const parts = new Map(listComponents(ctx, bikeId).map((part) => [part.id, part]));
    // A past day: the last millisecond of 20 February in Paris (D-61).
    const at = Date.parse("2026-02-20T22:59:59.999Z");
    expect(parts.get(forkId)?.removedAt).toBe(at);
    expect(parts.get(zebId)?.installedAt).toBe(at);

    // The Lyrik was fitted on 14 March 2024.
    expect(
      updateMaintenanceEvent(ctx, created.eventId, { ...base, performedOn: "2024-03-01" }, TZ),
    ).toEqual({ ok: false, reason: "before_fitting" });
    // The Zeb is replaced on 1 March: the event cannot move after that.
    replaceFork(ctx, zebId, null, "2026-03-01");
    expect(
      updateMaintenanceEvent(ctx, created.eventId, { ...base, performedOn: "2026-03-02" }, TZ),
    ).toEqual({ ok: false, reason: "after_removal" });
    expect(listMaintenanceEvents(ctx, bikeId).find((e) => e.id === created.eventId)).toMatchObject({
      performedOn: "2026-02-20",
    });
  });

  it("deletes an event with its replacements, unless a part it fitted was replaced since", () => {
    const { ctx, bikeId, forkId } = setup("Delete");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    const zebId = replaceFork(ctx, forkId, created.eventId, "2026-03-02");
    // A line of the same event naming the new part does not hold it back.
    const base = edited(bikeId, forkId);
    updateMaintenanceEvent(
      ctx,
      created.eventId,
      { ...base, lines: [{ ...base.lines[0], componentId: zebId }] },
      TZ,
    );
    expect(deleteMaintenanceEvent(ctx, created.eventId)).toEqual({ ok: true });
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);
    expect(listComponents(ctx, bikeId).map((part) => [part.id, part.removedAt])).toEqual([
      [forkId, null],
    ]);

    const again = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!again.ok) throw new Error(again.reason);
    const secondZeb = replaceFork(ctx, forkId, again.eventId, "2026-03-02");
    replaceFork(ctx, secondZeb, null, "2026-03-04");
    expect(deleteMaintenanceEvent(ctx, again.eventId)).toEqual({ ok: false, reason: "too_late" });
    expect(listMaintenanceEvents(ctx, bikeId)).toHaveLength(2);
  });

  it("refuses a part or a rule of another bike when editing", () => {
    const { ctx, bikeId, forkId } = setup("Edit parts");
    const { forkId: otherFork } = setup("Edit parts 2");
    const created = createMaintenanceEvent(ctx, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    const base = edited(bikeId, forkId);
    expect(
      updateMaintenanceEvent(
        ctx,
        created.eventId,
        { ...base, lines: [{ ...base.lines[0], componentId: otherFork }] },
        TZ,
      ),
    ).toEqual({ ok: false, reason: "unknown_part" });
    expect(listMaintenanceEvents(ctx, bikeId)[0].items).toHaveLength(2);
  });

  it("keeps each workspace's maintenance to itself", () => {
    const { ctx: owner, bikeId, forkId } = setup("Owner");
    const { ctx: intruder } = setup("Intruder");
    expect(createMaintenanceEvent(intruder, event(bikeId, forkId))).toEqual({
      ok: false,
      reason: "not_found",
    });
    const created = createMaintenanceEvent(owner, event(bikeId, forkId));
    if (!created.ok) throw new Error(created.reason);
    expect(deleteMaintenanceEvent(intruder, created.eventId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    const base = edited(bikeId, forkId);
    expect(
      updateMaintenanceEvent(intruder, created.eventId, { ...base, title: "Pirate" }, TZ),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(listMaintenanceEvents(owner, bikeId)).toHaveLength(1);
  });
});
