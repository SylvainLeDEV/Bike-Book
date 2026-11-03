import { describe, expect, it } from "vitest";
import { addDays, NBSP } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  getComponent,
  listComponents,
  listDoneTasks,
  listMaintenanceEvents,
  listOpenTasks,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The maintenance tools of D-93 through the real route: "C'est fait" on rules, a part replaced
// from the workshop's stock, a task done; refusals with the sheets' French messages, dry runs
// that write nothing, and the workspace boundary.

function garage(name: string): { ctx: AccessContext; token: string } {
  const ctx = createTestContext(name);
  return { ctx, token: issueToken(ctx, "Tests").token };
}

const fr = (text: string) => text.replaceAll("~", NBSP);

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

/** A part fitted to the bike, without its rule templates; answers its id. */
async function fit(token: string, bikeId: number, part: Record<string, unknown>) {
  const answer = await callTool(token, "add_component", {
    bike_id: bikeId,
    rules: [],
    ...part,
    dry_run: false,
  });
  return answer.structuredContent.component.id as number;
}

async function rule(token: string, bikeId: number, fields: Record<string, unknown>) {
  const answer = await callTool(token, "add_rule", { bike_id: bikeId, ...fields, dry_run: false });
  return answer.structuredContent.rule.id as number;
}

describe("record_maintenance", () => {
  it('is "C\'est fait": a dry run writes nothing, then the rules restart from that day', async () => {
    const { ctx, token } = garage("Done");
    const bikeId = addBike(ctx); // bought in 2021: a 30-day rule is long overdue
    const brakeId = await fit(token, bikeId, {
      type_code: "brake",
      position: "rear",
      model: "Code RSC",
    });
    const bleedId = await rule(token, bikeId, {
      component_type_code: "brake",
      position: "rear",
      title: "Purge du frein arrière",
      interval_days: 365,
    });
    const checkId = await rule(token, bikeId, { title: "Contrôle général", interval_days: 30 });

    const input = { bike_id: bikeId, lines: [{ rule_id: bleedId }, { rule_id: checkId }] };
    const preview = await callTool(token, "record_maintenance", { ...input, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent.event).toMatchObject({
      id: null,
      on: today(),
      title: "Purge du frein arrière · Contrôle général",
      performed_by: "self",
      lines: [
        { action: "bled", component_id: brakeId, rule_id: bleedId },
        { action: "serviced", component_id: null, rule_id: checkId },
      ],
    });
    expect(preview.structuredContent.rules_restarted).toEqual([
      expect.objectContaining({ id: bleedId, status: "ok", counts_from: today() }),
      expect.objectContaining({ id: checkId, status: "ok" }),
    ]);
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);

    const written = await callTool(token, "record_maintenance", {
      ...input,
      title: "Purge et contrôle",
      performed_by: "shop",
      shop: { name: "Rayon Libre" },
      total_cost_cents: 4500,
      dry_run: false,
    });
    expect(written.structuredContent.event).toMatchObject({
      id: expect.any(Number),
      title: "Purge et contrôle",
      shop: { name: "Rayon Libre", kind: "physical" },
      url: expect.stringMatching(/\/bikes\/\d+\?event=\d+$/),
    });
    expect(listMaintenanceEvents(ctx, bikeId)).toHaveLength(1);

    const due = await callTool(token, "list_due_work", { bike_id: bikeId });
    expect(due.structuredContent.rules).toEqual([]);
  });

  it("a day long ago leaves the rule overdue and warns", async () => {
    const { ctx, token } = garage("Old");
    const bikeId = addBike(ctx);
    const checkId = await rule(token, bikeId, { title: "Contrôle général", interval_days: 30 });
    const answer = await callTool(token, "record_maintenance", {
      bike_id: bikeId,
      on: addDays(today(), -60),
      lines: [{ rule_id: checkId, description: "Serrages vérifiés" }],
      dry_run: true,
    });
    expect(answer.structuredContent.rules_restarted[0].status).toBe("overdue");
    expect(answer.structuredContent.warnings[0]).toMatch(/still due soon or overdue/);
  });

  it("refuses with the sheet's French messages, and writes nothing", async () => {
    const a = garage("Refusals");
    const other = addBike(a.ctx, "Autre");
    const otherRule = await rule(a.token, other, { title: "Autre règle", interval_days: 30 });
    const bikeId = addBike(a.ctx);
    const call = (args: Record<string, unknown>) =>
      callTool(a.token, "record_maintenance", { bike_id: bikeId, dry_run: false, ...args });

    expect((await call({ lines: [{ rule_id: otherRule }] })).structuredContent.errors).toEqual([
      { field: "lines[0].rule_id", message: "Règle introuvable sur ce vélo." },
    ]);
    expect(
      (await call({ title: "Réglage", lines: [{ description: "x" }] })).structuredContent.errors,
    ).toEqual([{ field: "lines[0].action", message: "Indique ce qui a été fait." }]);
    expect(
      (await call({ title: "Réglage", on: addDays(today(), 1), lines: [] })).structuredContent
        .errors,
    ).toEqual([{ field: "on", message: "La date ne peut pas être dans le futur." }]);
    expect((await call({ lines: [{ action: "cleaned" }] })).structuredContent.errors).toEqual([
      { field: "title", message: "Donne un titre à l'entretien." },
    ]);
    expect(
      (
        await call({
          title: "Mesure",
          lines: [{ action: "inspected", measurement_value: 0.5 }],
        })
      ).structuredContent.errors,
    ).toEqual([
      { field: "lines[0].measurement_value", message: "Indique la mesure et son unité." },
    ]);
    expect(
      (await call({ title: "Révision", performed_by: "shop", lines: [] })).structuredContent.errors,
    ).toEqual([{ field: "shop", message: "Indique l'atelier qui l'a fait." }]);
    expect(listMaintenanceEvents(a.ctx, null)).toEqual([]);
  });
});

describe("replace_component", () => {
  async function padsInStock(token: string, ctx: AccessContext) {
    const bikeId = addBike(ctx);
    const padsId = await fit(token, bikeId, {
      type_code: "brake_pads",
      position: "front",
      brand: "SRAM",
      model: "Organiques",
    });
    const ruleId = await rule(token, bikeId, {
      component_type_code: "brake_pads",
      position: "front",
      title: "Plaquettes avant",
      interval_days: 90,
    });
    const item = await callTool(token, "add_workshop_item", {
      kind: "part",
      name: "Plaquettes métal",
      brand: "SwissStop",
      category: "brakes",
      component_type_code: "brake_pads",
      quantity: 0,
      unit: "pair",
      dry_run: false,
    });
    const itemId = item.structuredContent.item.id as number;
    await callTool(token, "update_stock", {
      item_id: itemId,
      action: "purchase",
      quantity: 2,
      unit_price_cents: 2490,
      dry_run: false,
    });
    return { bikeId, padsId, ruleId, itemId };
  }

  it("takes the new part from the workshop: dry run, then the swap, the stock and the rule", async () => {
    const { ctx, token } = garage("Swap");
    const { bikeId, padsId, ruleId, itemId } = await padsInStock(token, ctx);

    const preview = await callTool(token, "replace_component", {
      component_id: padsId,
      reason: "worn",
      from_item_id: itemId,
      dry_run: true,
    });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent).toMatchObject({
      removed: { id: padsId, removed_on: today() },
      fitted: {
        id: null,
        brand: "SwissStop",
        model: "Plaquettes métal",
        purchase_price_cents: 2490,
        position: "front",
      },
      stock_after: { item_id: itemId, stock_text: fr("1~paire") },
      rules_restarted: [expect.objectContaining({ id: ruleId, status: "ok" })],
    });
    expect(getComponent(ctx, padsId)?.removedAt).toBeNull();

    const written = await callTool(token, "replace_component", {
      component_id: padsId,
      reason: "worn",
      from_item_id: itemId,
      dry_run: false,
    });
    const fitted = written.structuredContent.fitted.id as number;
    expect(listComponents(ctx, bikeId).filter((c) => c.removedAt == null)).toEqual([
      expect.objectContaining({ id: fitted, model: "Plaquettes métal" }),
    ]);
    expect(written.structuredContent.event_id).toEqual(expect.any(Number));

    const again = await callTool(token, "replace_component", {
      component_id: padsId,
      reason: "worn",
      model: "X",
      dry_run: false,
    });
    expect(again.structuredContent.errors).toEqual([
      { field: "component_id", message: "Cette pièce a déjà été retirée." },
    ]);
  });

  it("adds the line to a maintenance event of the same day, and refuses an empty stock", async () => {
    const { ctx, token } = garage("Same day");
    const { bikeId, padsId, itemId } = await padsInStock(token, ctx);
    await callTool(token, "update_stock", {
      item_id: itemId,
      action: "count",
      counted: 0,
      dry_run: false,
    });
    const empty = await callTool(token, "replace_component", {
      component_id: padsId,
      reason: "worn",
      from_item_id: itemId,
      dry_run: false,
    });
    expect(empty.structuredContent.errors).toEqual([
      { field: "from_item_id", message: "Plus rien en stock pour cet objet." },
    ]);

    const event = await callTool(token, "record_maintenance", {
      bike_id: bikeId,
      title: "Freins",
      lines: [{ action: "cleaned", description: "Disque dégraissé" }],
      dry_run: false,
    });
    const eventId = event.structuredContent.event.id as number;
    const swap = await callTool(token, "replace_component", {
      component_id: padsId,
      reason: "worn",
      brand: "Galfer",
      model: "Pro",
      price_cents: 1990,
      event_id: eventId,
      dry_run: false,
    });
    expect(swap.structuredContent.event_id).toBe(eventId);
    const [stored] = listMaintenanceEvents(ctx, bikeId);
    expect(stored?.items.map((item) => item.action)).toEqual(["cleaned", "replaced"]);

    const before = await callTool(token, "replace_component", {
      component_id: swap.structuredContent.fitted.id,
      reason: "worn",
      model: "Y",
      on: addDays(today(), -1),
      dry_run: false,
    });
    expect(before.structuredContent.errors[0]).toMatchObject({ field: "on" });
  });
});

describe("set_task_done", () => {
  it("marks a task done on a day, reopens it, and refuses a future day", async () => {
    const { ctx, token } = garage("Tasks");
    const bikeId = addBike(ctx);
    const created = await callTool(token, "add_task", {
      bike_id: bikeId,
      title: "Changer la chaîne",
      dry_run: false,
    });
    const taskId = created.structuredContent.task.id as number;

    const preview = await callTool(token, "set_task_done", { task_id: taskId, dry_run: true });
    expect(preview.structuredContent).toMatchObject({ changed: true, task: { status: "done" } });
    expect(listOpenTasks(ctx)).toHaveLength(1);

    const future = await callTool(token, "set_task_done", {
      task_id: taskId,
      done_on: addDays(today(), 1),
      dry_run: false,
    });
    expect(future.structuredContent.errors).toEqual([
      { field: "done_on", message: "La date ne peut pas être dans le futur." },
    ]);

    const yesterday = addDays(today(), -1);
    const done = await callTool(token, "set_task_done", {
      task_id: taskId,
      done_on: yesterday,
      dry_run: false,
    });
    expect(done.structuredContent.task).toMatchObject({ status: "done", done_on: yesterday });
    expect(listOpenTasks(ctx)).toEqual([]);
    expect(listDoneTasks(ctx)).toHaveLength(1);

    const same = await callTool(token, "set_task_done", { task_id: taskId, dry_run: false });
    expect(same.structuredContent.changed).toBe(false);
    await callTool(token, "set_task_done", { task_id: taskId, done: false, dry_run: false });
    expect(listOpenTasks(ctx)).toHaveLength(1);
  });
});

describe("workspace boundary (D-93 tools)", () => {
  it("a token of workspace A changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const bobPart = await fit(b.token, bobBike, { type_code: "chain", model: "X11" });
    const task = await callTool(b.token, "add_task", { title: "Bob", dry_run: false });
    const calls: [string, Record<string, unknown>, string][] = [
      ["record_maintenance", { bike_id: bobBike, title: "x", lines: [] }, "bike_id"],
      ["replace_component", { component_id: bobPart, reason: "worn", model: "Y" }, "component_id"],
      ["set_task_done", { task_id: task.structuredContent.task.id }, "task_id"],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, { ...args, dry_run: false });
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listMaintenanceEvents(b.ctx, null)).toEqual([]);
    expect(listOpenTasks(b.ctx)).toHaveLength(1);
  });
});
