import { describe, expect, it } from "vitest";
import { addDays, NBSP } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  listInventory,
  listOpenTasks,
  listRules,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { stockQuantity } from "@/server/domain/inventory";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The tools of D-94 through the real route: restocking ("À commander", "Reçu") and the edits of
// a workshop item, a task and a rule (with "Reporter"); refusals in French, dry runs that write
// nothing, and the workspace boundary.

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

async function addItem(token: string, item: Record<string, unknown>): Promise<number> {
  const answer = await callTool(token, "add_workshop_item", { ...item, dry_run: false });
  return answer.structuredContent.item.id as number;
}

const quantityOf = (ctx: AccessContext, itemId: number) =>
  stockQuantity(listInventory(ctx).find((item) => item.id === itemId)!.movements);

describe("restocking", () => {
  it("set_restock then receive_item: to order, ordered, received at the link's price", async () => {
    const { ctx, token } = garage("Restock");
    const padsId = await addItem(token, {
      kind: "part",
      name: "Plaquettes",
      category: "brakes",
      quantity: 0,
      unit: "pair",
      link: { shop_name: "Rayon Libre", price_cents: 2490 },
    });

    const preview = await callTool(token, "set_restock", {
      item_id: padsId,
      status: "to_order",
      quantity: 2,
      dry_run: true,
    });
    expect(preview.structuredContent.item).toMatchObject({ rebuy_state: "to_order" });
    expect(listInventory(ctx)[0]?.restockStatus).toBe("none");

    await callTool(token, "set_restock", {
      item_id: padsId,
      status: "to_order",
      quantity: 2,
      dry_run: false,
    });
    const ordered = await callTool(token, "set_restock", {
      item_id: padsId,
      status: "ordered",
      dry_run: false,
    });
    expect(ordered.structuredContent).toMatchObject({
      item: { rebuy_state: "ordered" },
      restock_quantity: 2,
    });

    const received = await callTool(token, "receive_item", { item_id: padsId, dry_run: false });
    expect(received.structuredContent.item).toMatchObject({
      stock_text: fr("2~paires"),
      rebuy_state: null,
      last_unit_cost_cents: 2490,
    });
    expect(quantityOf(ctx, padsId)).toBe(2);
  });

  it("a tool owned cannot be ordered; one not owned is received once", async () => {
    const { ctx, token } = garage("Tools");
    const owned = await addItem(token, { kind: "tool", name: "Clé 5 mm", category: "other" });
    const refused = await callTool(token, "set_restock", {
      item_id: owned,
      status: "to_order",
      dry_run: false,
    });
    expect(refused.structuredContent.errors[0]).toMatchObject({ field: "item_id" });

    const missing = await addItem(token, {
      kind: "tool",
      name: "Fouet à cassette",
      category: "drivetrain",
      owned: false,
    });
    const got = await callTool(token, "receive_item", {
      item_id: missing,
      quantity: 3,
      unit_price_cents: 1500,
      dry_run: false,
    });
    expect(got.structuredContent.item).toMatchObject({ stock: { owned: true }, rebuy_state: null });
    expect(quantityOf(ctx, missing)).toBe(1);
  });

  it("a product received opens its first container full", async () => {
    const { token } = garage("Oil");
    const oil = await addItem(token, {
      kind: "product",
      name: "Huile minérale",
      category: "brakes",
      containers: 0,
      container_label: "flacon",
    });
    const got = await callTool(token, "receive_item", {
      item_id: oil,
      quantity: 2,
      dry_run: false,
    });
    expect(got.structuredContent.item).toMatchObject({
      stock: { containers: 2, level: "full" },
      stock_text: fr("plein · 2~flacons"),
    });
  });
});

describe("update_workshop_item", () => {
  it("changes only the fields given, adds a link, and never the stock", async () => {
    const { ctx, token } = garage("Edit item");
    const enduro = addBike(ctx);
    const chain = await addItem(token, {
      kind: "part",
      name: "Chaîne",
      category: "drivetrain",
      quantity: 3,
      location: "Tiroir",
    });

    const changed = await callTool(token, "update_workshop_item", {
      item_id: chain,
      name: "Chaîne 12v",
      bike_ids: [enduro],
      low_stock_threshold: 1,
      add_link: { shop_name: "Rayon Libre", url: "https://shop.example/chaine", price_cents: 3990 },
      dry_run: false,
    });
    expect(changed.structuredContent.item).toMatchObject({
      name: "Chaîne 12v",
      location: "Tiroir",
      bikes: [{ id: enduro, name: "Enduro" }],
      low_stock_threshold: 1,
      stock: { quantity: 3 },
      purchase_links: [{ shop_name: "Rayon Libre", price_cents: 3990 }],
    });

    const refused = await callTool(token, "update_workshop_item", {
      item_id: chain,
      quantity: 10,
      container_label: "bidon",
      dry_run: false,
    });
    expect(refused.structuredContent.errors).toEqual([
      { field: "quantity", message: "Le stock se change avec update_stock." },
      { field: "container_label", message: "Ce champ ne concerne pas ce type d'objet." },
    ]);
    const badLink = await callTool(token, "update_workshop_item", {
      item_id: chain,
      add_link: { url: "ftp://x" },
      dry_run: false,
    });
    expect(badLink.structuredContent.errors[0]).toMatchObject({ field: "add_link.url" });
    expect(quantityOf(ctx, chain)).toBe(3);
  });
});

describe("update_task", () => {
  it("changes only the fields given; null makes it a general task", async () => {
    const { ctx, token } = garage("Edit task");
    const bikeId = addBike(ctx);
    const created = await callTool(token, "add_task", {
      bike_id: bikeId,
      title: "Changer la chaîne",
      notes: "12v",
      dry_run: false,
    });
    const taskId = created.structuredContent.task.id as number;
    const due = addDays(today(), 7);
    const changed = await callTool(token, "update_task", {
      task_id: taskId,
      bike_id: null,
      due_on: due,
      dry_run: false,
    });
    expect(changed.structuredContent.task).toMatchObject({
      bike: null,
      title: "Changer la chaîne",
      notes: "12v",
      due_on: due,
    });
    expect(listOpenTasks(ctx)[0]).toMatchObject({ bikeId: null, dueOn: due });

    const empty = await callTool(token, "update_task", {
      task_id: taskId,
      title: " ",
      dry_run: false,
    });
    expect(empty.structuredContent.errors).toEqual([
      { field: "title", message: "Donne un titre à la tâche." },
    ]);
  });
});

describe("update_rule and snooze_rule", () => {
  it("update_rule keeps what is not given, and can pause a rule", async () => {
    const { ctx, token } = garage("Edit rule");
    const bikeId = addBike(ctx);
    const added = await callTool(token, "add_rule", {
      bike_id: bikeId,
      title: "Contrôle général",
      interval_days: 30,
      last_done_on: addDays(today(), -10),
      notes: "Serrages",
      dry_run: false,
    });
    const ruleId = added.structuredContent.rule.id as number;

    const preview = await callTool(token, "update_rule", {
      rule_id: ruleId,
      interval_days: 5,
      dry_run: true,
    });
    expect(preview.structuredContent).toMatchObject({
      before: { status: "ok", interval_days: 30 },
      rule: {
        status: "overdue",
        interval_days: 5,
        notes: "Serrages",
        counts_from: addDays(today(), -10),
      },
    });
    expect(listRules(ctx, bikeId)[0]?.intervalDays).toBe(30);

    const paused = await callTool(token, "update_rule", {
      rule_id: ruleId,
      active: false,
      dry_run: false,
    });
    expect(paused.structuredContent.rule).toMatchObject({ active: false, interval_days: 30 });

    const noInterval = await callTool(token, "update_rule", {
      rule_id: ruleId,
      interval_days: null,
      dry_run: false,
    });
    expect(noInterval.structuredContent.errors).toEqual([
      {
        field: "interval_distance_m",
        message: "Indique au moins un intervalle : km, heures ou jours.",
      },
    ]);
  });

  it("snooze_rule takes the rule out of the due list until a day, and back", async () => {
    const { ctx, token } = garage("Snooze");
    const bikeId = addBike(ctx); // 2021: a 30-day rule is overdue
    const added = await callTool(token, "add_rule", {
      bike_id: bikeId,
      title: "Contrôle général",
      interval_days: 30,
      dry_run: false,
    });
    const ruleId = added.structuredContent.rule.id as number;

    const snoozed = await callTool(token, "snooze_rule", { rule_id: ruleId, dry_run: false });
    expect(snoozed.structuredContent.rule).toMatchObject({
      status: "snoozed",
      snoozed_until: addDays(today(), 14),
    });
    expect((await callTool(token, "list_due_work", {})).structuredContent.rules).toEqual([]);

    const past = await callTool(token, "snooze_rule", {
      rule_id: ruleId,
      until: today(),
      dry_run: false,
    });
    expect(past.structuredContent.errors).toEqual([
      { field: "until", message: "Choisis un jour après aujourd'hui." },
    ]);
    const far = await callTool(token, "snooze_rule", {
      rule_id: ruleId,
      until: addDays(today(), 4000),
      dry_run: false,
    });
    expect(far.structuredContent.errors).toEqual([
      { field: "until", message: "Choisis un jour dans les dix prochaines années." },
    ]);
    const listed = await callTool(token, "list_rules", { bike_id: bikeId });
    expect(listed.structuredContent.rules[0]).toMatchObject({
      status: "snoozed",
      snoozed_until: addDays(today(), 14),
    });
    await callTool(token, "snooze_rule", { rule_id: ruleId, until: null, dry_run: false });
    expect((await callTool(token, "list_due_work", {})).structuredContent.rules).toHaveLength(1);
  });
});

describe("workspace boundary (D-94 tools)", () => {
  it("a token of workspace A changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const bobItem = await addItem(b.token, {
      kind: "part",
      name: "Chaîne",
      category: "drivetrain",
    });
    const task = await callTool(b.token, "add_task", { title: "Bob", dry_run: false });
    const rule = await callTool(b.token, "add_rule", {
      bike_id: bobBike,
      title: "Bob",
      interval_days: 30,
      dry_run: false,
    });
    const calls: [string, Record<string, unknown>, string][] = [
      ["update_workshop_item", { item_id: bobItem, name: "x" }, "item_id"],
      ["set_restock", { item_id: bobItem, status: "to_order" }, "item_id"],
      ["receive_item", { item_id: bobItem }, "item_id"],
      ["update_task", { task_id: task.structuredContent.task.id, title: "x" }, "task_id"],
      ["update_rule", { rule_id: rule.structuredContent.rule.id, title: "x" }, "rule_id"],
      ["snooze_rule", { rule_id: rule.structuredContent.rule.id }, "rule_id"],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, { ...args, dry_run: false });
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listInventory(b.ctx)[0]).toMatchObject({ name: "Chaîne", restockStatus: "none" });
    expect(listRules(b.ctx, bobBike)[0]).toMatchObject({ title: "Bob", snoozeEndsOn: null });
  });
});
