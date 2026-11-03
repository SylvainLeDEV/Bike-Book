import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  listInventory,
  listMaintenanceEvents,
  listSetups,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The tools of D-95 through the real route: the maintenance history and its corrections, the
// setup log, and archiving a workshop item; refusals in French, dry runs that write nothing, and
// the workspace boundary.

function garage(name: string): { ctx: AccessContext; token: string } {
  const ctx = createTestContext(name);
  return { ctx, token: issueToken(ctx, "Tests").token };
}

const BIKE: BikeData = {
  name: "Enduro",
  discipline: "enduro",
  isElectric: false,
  brand: "Origine",
  model: "Trail Rider",
  modelYear: 2021,
  frameSize: "M",
  wheelSize: "29",
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: "2021-05-02",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2021-05-02",
  salePriceCents: null,
  notes: null,
};

function addBike(ctx: AccessContext, name = BIKE.name): number {
  const outcome = createBike(ctx, { ...BIKE, name });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.bikeId;
}

async function fit(token: string, bikeId: number, part: Record<string, unknown>) {
  const answer = await callTool(token, "add_component", {
    bike_id: bikeId,
    rules: [],
    ...part,
    dry_run: false,
  });
  return answer.structuredContent.component.id as number;
}

describe("list_maintenance and update_maintenance", () => {
  it("lists the history with its filters", async () => {
    const { ctx, token } = garage("History");
    const enduro = addBike(ctx, "Enduro");
    const gravel = addBike(ctx, "Gravel");
    const brake = await fit(token, enduro, { type_code: "brake", position: "rear", model: "Code" });
    const rule = await callTool(token, "add_rule", {
      bike_id: enduro,
      component_type_code: "brake",
      position: "rear",
      title: "Purge arrière",
      interval_days: 365,
      dry_run: false,
    });
    const ruleId = rule.structuredContent.rule.id as number;
    const record = (bikeId: number, on: string, args: Record<string, unknown>) =>
      callTool(token, "record_maintenance", { bike_id: bikeId, on, ...args, dry_run: false });
    await record(enduro, addDays(today(), -100), { lines: [{ rule_id: ruleId }] });
    await record(enduro, addDays(today(), -20), {
      title: "Nettoyage",
      lines: [{ action: "cleaned", description: "Transmission dégraissée" }],
    });
    await record(gravel, addDays(today(), -5), {
      title: "Pneus",
      lines: [{ action: "inspected" }],
    });

    const all = await callTool(token, "list_maintenance", {});
    expect(all.structuredContent.events.map((e: { title: string }) => e.title)).toEqual([
      "Pneus",
      "Nettoyage",
      "Purge arrière",
    ]);
    const bled = await callTool(token, "list_maintenance", { rule_id: ruleId });
    // The bike once, as `bike` (D-100); the time spent is there (null outside a run).
    expect(bled.structuredContent.events[0]).not.toHaveProperty("bike_id");
    expect(bled.structuredContent.events[0]).toMatchObject({ labor_time_s: null });
    expect(bled.structuredContent.events).toEqual([
      expect.objectContaining({
        bike: { id: enduro, name: "Enduro" },
        on: addDays(today(), -100),
        lines: [
          expect.objectContaining({
            action: "bled",
            action_label: "Purgé",
            component_id: brake,
            rule_title: "Purge arrière",
          }),
        ],
      }),
    ]);
    const words = await callTool(token, "list_maintenance", {
      bike_id: enduro,
      query: "degraissee",
    });
    expect(words.structuredContent.events.map((e: { title: string }) => e.title)).toEqual([
      "Nettoyage",
    ]);
    const recent = await callTool(token, "list_maintenance", { from: addDays(today(), -30) });
    expect(recent.structuredContent.events).toHaveLength(2);
  });

  it("update_maintenance changes only the fields given and keeps the replacements", async () => {
    const { ctx, token } = garage("Fix");
    const bikeId = addBike(ctx);
    const pads = await fit(token, bikeId, {
      type_code: "brake_pads",
      position: "front",
      model: "Organiques",
      installed_on: addDays(today(), -30),
    });
    const event = await callTool(token, "record_maintenance", {
      bike_id: bikeId,
      title: "Frein avant",
      lines: [{ action: "cleaned" }],
      dry_run: false,
    });
    const eventId = event.structuredContent.event.id as number;
    await callTool(token, "replace_component", {
      component_id: pads,
      reason: "worn",
      model: "Métal",
      event_id: eventId,
      dry_run: false,
    });

    const preview = await callTool(token, "update_maintenance", {
      event_id: eventId,
      title: "Frein avant complet",
      dry_run: true,
    });
    expect(preview.structuredContent.event.title).toBe("Frein avant complet");
    expect(listMaintenanceEvents(ctx, bikeId)[0]?.title).toBe("Frein avant");

    const changed = await callTool(token, "update_maintenance", {
      event_id: eventId,
      total_cost_cents: 3500,
      lines: [{ action: "bled", description: "Huile neuve" }],
      dry_run: false,
    });
    expect(changed.structuredContent.event).toMatchObject({
      title: "Frein avant",
      total_cost_cents: 3500,
    });
    expect(listMaintenanceEvents(ctx, bikeId)[0]?.items.map((i) => i.action)).toEqual([
      "replaced",
      "bled",
    ]);

    const tooEarly = await callTool(token, "update_maintenance", {
      event_id: eventId,
      on: addDays(today(), -60),
      dry_run: false,
    });
    expect(tooEarly.structuredContent.errors).toEqual([
      { field: "on", message: "La pièce remplacée a été montée après cette date." },
    ]);
  });
});

describe("list_setups and add_setup", () => {
  async function enduroWithSuspension(token: string, ctx: AccessContext) {
    const bikeId = addBike(ctx);
    const fork = await fit(token, bikeId, {
      type_code: "fork",
      brand: "Fox",
      model: "36",
      suspension: {
        spring_type: "air",
        travel_mm: 160,
        max_clicks: { low_speed_rebound: 18, low_speed_compression: 16 },
      },
    });
    return { bikeId, fork };
  }

  it("a new setup starts from the current one; only the values given change", async () => {
    const { ctx, token } = garage("Setup");
    const { bikeId, fork } = await enduroWithSuspension(token, ctx);

    const first = await callTool(token, "add_setup", {
      bike_id: bikeId,
      set_on: addDays(today(), -10),
      tire_front_pressure_bar: 1.6,
      fork: { air_pressure_psi: 85, sag_mm: 32, clicks: { low_speed_rebound: 8 } },
      dry_run: false,
    });
    expect(first.structuredContent.setup.suspensions).toEqual([
      expect.objectContaining({
        component_id: fork,
        type_code: "fork",
        air_pressure_psi: 85,
        sag_mm: 32,
        sag_percent: 20,
        clicks: expect.objectContaining({ low_speed_rebound: 8 }),
      }),
    ]);

    const preview = await callTool(token, "add_setup", {
      bike_id: bikeId,
      label: "Bike park",
      fork: { air_pressure_psi: 90 },
      dry_run: true,
    });
    expect(preview.structuredContent.setup).toMatchObject({
      id: null,
      set_on: today(),
      label: "Bike park",
      tire_front_pressure_bar: 1.6,
      changes: [{ component_id: fork, field: "air_pressure_psi", from: 85, to: 90 }],
    });
    expect(listSetups(ctx, bikeId)).toHaveLength(1);

    await callTool(token, "add_setup", {
      bike_id: bikeId,
      fork: { air_pressure_psi: 90 },
      dry_run: false,
    });
    const listed = await callTool(token, "list_setups", { bike_id: bikeId });
    expect(listed.structuredContent.setups.map((s: { set_on: string }) => s.set_on)).toEqual([
      today(),
      addDays(today(), -10),
    ]);
    expect(listed.structuredContent.suspension_units).toEqual([
      expect.objectContaining({ component_id: fork, travel_mm: 160 }),
    ]);
  });

  it("refuses values beyond the part's specs, and a part not fitted", async () => {
    const { ctx, token } = garage("Bounds");
    const { bikeId } = await enduroWithSuspension(token, ctx);
    const beyond = await callTool(token, "add_setup", {
      bike_id: bikeId,
      fork: { clicks: { low_speed_rebound: 25, high_speed_rebound: 3 } },
      dry_run: false,
    });
    expect(beyond.structuredContent.errors).toEqual(
      expect.arrayContaining([
        { field: "fork.clicks.low_speed_rebound", message: "Au plus 18 clics." },
        { field: "fork.clicks.high_speed_rebound", message: "Cette pièce n'a pas cette molette." },
      ]),
    );
    const noShock = await callTool(token, "add_setup", {
      bike_id: bikeId,
      rear_shock: { air_pressure_psi: 200 },
      dry_run: false,
    });
    expect(noShock.structuredContent.errors).toEqual([
      { field: "rear_shock", message: "Pas d'amortisseur sur ce vélo." },
    ]);
    const future = await callTool(token, "add_setup", {
      bike_id: bikeId,
      set_on: addDays(today(), 1),
      dry_run: false,
    });
    expect(future.structuredContent.errors).toEqual([
      { field: "set_on", message: "La date ne peut pas être dans le futur." },
    ]);
    expect(listSetups(ctx, bikeId)).toEqual([]);
  });
});

describe("archive_workshop_item", () => {
  it("takes an item out of the workshop's lists, and back", async () => {
    const { ctx, token } = garage("Archive");
    const added = await callTool(token, "add_workshop_item", {
      kind: "tool",
      name: "Vieille pompe",
      category: "other",
      dry_run: false,
    });
    const itemId = added.structuredContent.item.id as number;
    const preview = await callTool(token, "archive_workshop_item", {
      item_id: itemId,
      dry_run: true,
    });
    expect(preview.structuredContent).toMatchObject({ changed: true, item: { archived: true } });
    expect(listInventory(ctx)[0]?.archivedAt).toBeNull();

    const archived = await callTool(token, "archive_workshop_item", {
      item_id: itemId,
      dry_run: false,
    });
    // Archived, the app has no page for it: the workshop's page.
    expect(archived.structuredContent.url).toMatch(/\/workshop$/);
    expect((await callTool(token, "list_workshop_items", {})).structuredContent.items).toEqual([]);
    const withArchived = await callTool(token, "list_workshop_items", { include_archived: true });
    expect(withArchived.structuredContent.items).toEqual([
      expect.objectContaining({ id: itemId, name: "Vieille pompe", archived: true }),
    ]);
    // Never in "À racheter", even marked to order.
    const rebuy = await callTool(token, "list_workshop_items", {
      to_rebuy: true,
      include_archived: true,
    });
    expect(rebuy.structuredContent.items).toEqual([]);
    const again = await callTool(token, "archive_workshop_item", {
      item_id: itemId,
      dry_run: true,
    });
    expect(again.structuredContent).toMatchObject({ changed: false, url: expect.any(String) });

    const back = await callTool(token, "archive_workshop_item", {
      item_id: itemId,
      archived: false,
      dry_run: false,
    });
    expect(back.structuredContent.url).toMatch(new RegExp(`/workshop\\?item=${itemId}$`));
    expect((await callTool(token, "list_workshop_items", {})).structuredContent.items).toEqual([
      expect.objectContaining({ id: itemId, archived: false }),
    ]);
  });
});

describe("workspace boundary (D-95 tools)", () => {
  it("a token of workspace A reads and changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const event = await callTool(b.token, "record_maintenance", {
      bike_id: bobBike,
      title: "Bob",
      lines: [{ action: "cleaned" }],
      dry_run: false,
    });
    const item = await callTool(b.token, "add_workshop_item", {
      kind: "tool",
      name: "Clé",
      category: "other",
      dry_run: false,
    });
    expect((await callTool(a.token, "list_maintenance", {})).structuredContent.events).toEqual([]);
    const calls: [string, Record<string, unknown>, string][] = [
      ["list_maintenance", { bike_id: bobBike }, "bike_id"],
      [
        "update_maintenance",
        { event_id: event.structuredContent.event.id, title: "x", dry_run: false },
        "event_id",
      ],
      ["list_setups", { bike_id: bobBike }, "bike_id"],
      ["add_setup", { bike_id: bobBike, dry_run: false }, "bike_id"],
      [
        "archive_workshop_item",
        { item_id: item.structuredContent.item.id, dry_run: false },
        "item_id",
      ],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, args);
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listMaintenanceEvents(b.ctx, null)[0]?.title).toBe("Bob");
    expect(listInventory(b.ctx)[0]?.archivedAt).toBeNull();
  });
});
