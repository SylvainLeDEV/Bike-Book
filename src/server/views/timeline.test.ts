import { describe, expect, it } from "vitest";
import type { Component, MaintenanceEvent, Ride } from "@/server/db";
import { maintenanceEdit, rideForm, timeline, timelineEdits, type DoneTask } from "./timeline";

const TZ = "Europe/Paris";

const ride: Ride = {
  id: 7,
  bikeId: 2,
  startedAt: Date.parse("2026-10-24T10:00:00Z"), // noon in Paris (summer time)
  title: null,
  location: "Massif des Bauges",
  rideType: "enduro",
  liftAssisted: false,
  distanceM: 30_000,
  descentDistanceM: null,
  totalTimeS: 7200,
  movingTimeS: null,
  descentTimeS: null,
  runsCount: null,
  elevationGainM: 200,
  elevationLossM: null,
  conditions: "dry",
  notes: null,
  source: "manual",
};

const part = (id: number, fields: Partial<Component>): Component => ({
  id,
  bikeId: 2,
  typeCode: "chain",
  position: "none",
  brand: null,
  model: null,
  reference: null,
  specs: null,
  origin: "stock",
  replacesComponentId: null,
  installedAt: 0,
  initialDistanceM: 0,
  initialWearS: 0,
  removedAt: null,
  removalReason: null,
  removalNote: null,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  warrantyEndsOn: null,
  notes: null,
  ...fields,
});

const item = (fields: Partial<MaintenanceEvent["items"][number]>) => ({
  id: 1,
  action: "serviced" as const,
  ruleId: null,
  componentId: null,
  newComponentId: null,
  description: null,
  costCents: null,
  measurementValue: null,
  measurementUnit: null,
  ...fields,
});

describe("rideForm", () => {
  it("gives back the quick entry's fields, noon meaning no start time (D-61)", () => {
    expect(rideForm(ride, TZ)).toEqual({
      bikeId: 2,
      on: "2026-10-24",
      rideType: "enduro",
      durationS: 7200,
      totalTimeS: null,
      descentTimeS: null,
      runsCount: null,
      distanceM: 30_000,
      elevationGainM: 200,
      conditions: "dry",
      location: "Massif des Bauges",
      notes: null,
      startTime: null,
    });
    expect(rideForm({ ...ride, startedAt: Date.parse("2026-10-24T06:30:00Z") }, TZ).startTime).toBe(
      "08:30",
    );
  });

  it("keeps a bike park day's total and descent times and its runs", () => {
    const park = { ...ride, rideType: "bike_park" as const, descentTimeS: 3600, runsCount: 12 };
    expect(rideForm(park, TZ)).toMatchObject({
      durationS: null,
      totalTimeS: 7200,
      descentTimeS: 3600,
      runsCount: 12,
    });
  });
});

describe("maintenanceEdit", () => {
  it("separates the editable lines from the replacements and names the parts removed since", () => {
    const event: MaintenanceEvent = {
      id: 5,
      bikeId: 2,
      performedOn: "2026-10-27",
      title: "Chaîne remplacée",
      performedBy: "self",
      shop: null,
      totalCostCents: null,
      notes: "fait maison",
      createdAt: 0,
      items: [
        item({ id: 1, action: "replaced", componentId: 10, newComponentId: 11, costCents: 3500 }),
        item({ id: 2, action: "cleaned", componentId: 12, costCents: 500 }),
      ],
    };
    const parts = [
      part(10, { brand: "SRAM", model: "GX", removedAt: 1 }),
      part(11, { brand: "Shimano", model: "XT" }),
      part(12, { typeCode: "cassette", model: "XG-1275", removedAt: 1 }),
    ];
    const edit = maintenanceEdit(event, parts);
    expect(edit.input.lines).toEqual([
      {
        action: "cleaned",
        componentId: 12,
        ruleId: null,
        description: null,
        costCents: 500,
        measurementValue: null,
        measurementUnit: null,
      },
    ]);
    expect(edit.replacements).toEqual([
      { label: "Chaîne : SRAM GX → Shimano XT", costCents: 3500 },
    ]);
    expect(edit.formerParts).toEqual([{ id: 12, label: "Cassette · XG-1275 (déposée)" }]);
    expect(edit.input).toMatchObject({ on: "2026-10-27", notes: "fait maison", shop: null });
  });
});

describe("timeline", () => {
  const task = (id: number, fields: Partial<DoneTask>): DoneTask => ({
    id,
    bikeId: 2,
    title: `Tâche ${id}`,
    dueOn: null,
    status: "done",
    doneAt: 0,
    notes: null,
    ...fields,
  });
  const event: MaintenanceEvent = {
    id: 5,
    bikeId: 2,
    performedOn: "2026-10-23",
    title: "Purge des freins",
    performedBy: "self",
    shop: null,
    totalCostCents: null,
    notes: null,
    createdAt: Date.parse("2026-10-24T18:00:00Z"), // recorded the next day: end of the 23rd
    items: [],
  };
  const pivots = task(1, {
    title: "Pivots",
    notes: "Serrés au couple",
    doneAt: Date.parse("2026-10-24T15:00:00Z"),
  });
  const pump = task(2, {
    bikeId: null,
    title: "Pompe",
    doneAt: Date.parse("2026-10-23T05:00:00Z"),
  });

  it("places done tasks at done_at among rides and maintenance (D-77)", () => {
    const items = timeline([ride], [event], [pump, pivots], new Map([[2, "Spectral"]]), TZ);
    expect(items.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "task:1", // 24 Oct, 17:00 in Paris
      "ride:7", // 24 Oct, noon
      "maintenance:5", // end of 23 Oct
      "task:2", // 23 Oct, 07:00
    ]);
    expect(items[0]).toEqual({
      kind: "task",
      id: 1,
      on: "2026-10-24",
      bikeName: "Spectral",
      title: "Pivots",
      note: "Serrés au couple",
      documents: [],
      photos: [],
    });
    expect(items[3]).toMatchObject({ kind: "task", bikeName: null, on: "2026-10-23" });
  });

  it("dates a done task in the configured time zone and opens it as 'Modifier la tâche'", () => {
    const late = task(3, { doneAt: Date.parse("2026-10-24T22:30:00Z") }); // 00:30 on the 25th
    expect(timeline([], [], [late], new Map([[2, "Spectral"]]), TZ)[0]?.on).toBe("2026-10-25");
    const edits = timelineEdits(
      [],
      [],
      [late, pump],
      [{ id: 2, name: "Spectral", coverAttachmentId: null }],
      TZ,
    );
    expect(edits.tasks[3]).toMatchObject({
      id: 3,
      bike: { id: 2, name: "Spectral" },
      title: "Tâche 3",
      doneOn: "2026-10-25",
    });
    expect(edits.tasks[2]).toMatchObject({ bike: null, doneOn: "2026-10-23" });
  });
});
