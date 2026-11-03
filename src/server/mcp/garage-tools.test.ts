import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, NBSP } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  createItem,
  createProcedure,
  listInventory,
  listOpenTasks,
  listRides,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { stockQuantity } from "@/server/domain/inventory";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The tools of D-92 through the real route: rides, what is to do, the workshop, the procedures.
// Normal case, refusals with the forms' French messages, dry runs that write nothing, and the
// workspace boundary.

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

function oil(ctx: AccessContext): number {
  const created = createItem(ctx, {
    kind: "product",
    name: "Huile minérale",
    brand: null,
    reference: null,
    category: "brakes",
    componentTypeCode: "brake",
    allBikes: true,
    bikeIds: [],
    unit: null,
    lowStockThreshold: null,
    containerLabel: "flacon",
    location: null,
    notes: null,
    initialQuantity: 1,
    link: null,
    at: Date.now(),
    today: today(),
  });
  if (!created.ok) throw new Error(created.reason);
  return created.itemId;
}

/** A brake bleed procedure: the oil (in the workshop), pads by type and a syringe (neither). */
function bleed(ctx: AccessContext, bikeId: number, itemId: number): number {
  const created = createProcedure(ctx, {
    title: "Purge des freins",
    description: "Fictive, pour les tests.",
    componentTypeCode: "brake",
    modelHint: null,
    allBikes: false,
    bikeIds: [bikeId],
    estimatedDurationS: 45 * 60,
    difficulty: "medium",
    steps: [
      { id: null, instruction: "Retirer la roue", note: null, torqueNm: null },
      { id: null, instruction: "Serrer l'étrier", note: null, torqueNm: 6.8 },
    ],
    items: [
      { inventoryItemId: itemId, quantity: null },
      { componentTypeCode: "brake_pads", quantity: 1 },
      { label: "Seringue", quantity: null },
    ],
    resources: [],
  });
  if (!created.ok) throw new Error(created.reason);
  return created.procedureId;
}

const RIDE = { on: today(), ride_type: "trail", duration_s: 5400, distance_m: 30_000 };

/** The app's French numbers: "2~paires" is "2", a no-break space, "paires". */
const fr = (text: string) => text.replaceAll("~", NBSP);

afterEach(() => vi.restoreAllMocks());

describe("ride tools", () => {
  it("create_ride: a dry run writes nothing, then the write answers the rules it makes due", async () => {
    const { ctx, token } = garage("Rider");
    const bikeId = addBike(ctx);
    await callTool(token, "add_rule", {
      bike_id: bikeId,
      title: "Révision complète",
      interval_distance_m: 100_000,
      dry_run: false,
    });
    const long = { bike_id: bikeId, ...RIDE, distance_m: 95_000, location: "Les Gets" };

    const preview = await callTool(token, "create_ride", { ...long, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent.ride).toMatchObject({
      id: null,
      on: today(),
      start_time: null,
      ride_type: "trail",
      total_time_s: 5400,
      distance_m: 95_000,
      wear_time_s: 5400,
      source: "manual",
    });
    expect(preview.structuredContent.rules_made_due).toEqual([
      expect.objectContaining({ title: "Révision complète", status: "due_soon", was: "ok" }),
    ]);
    expect(listRides(ctx, { bikeId })).toEqual([]);

    const written = await callTool(token, "create_ride", { ...long, dry_run: false });
    expect(written.structuredContent.ride.id).toEqual(expect.any(Number));
    expect(listRides(ctx, { bikeId })).toHaveLength(1);

    // The same ride again: a warning, never a refusal.
    const again = await callTool(token, "create_ride", { ...long, dry_run: true });
    expect(again.structuredContent.warnings[0]).toMatch(/within 30 minutes/);
  });

  it("create_ride: a bike park day counts its descent; misplaced fields and future days are refused", async () => {
    const { ctx, token } = garage("Park");
    const bikeId = addBike(ctx);
    const park = await callTool(token, "create_ride", {
      bike_id: bikeId,
      on: today(),
      ride_type: "bike_park",
      total_time_s: 6 * 3600,
      descent_time_s: 2 * 3600,
      runs_count: 12,
      start_time: "09:30",
      dry_run: false,
    });
    expect(park.structuredContent.ride).toMatchObject({
      lift_assisted: true,
      start_time: "09:30",
      total_time_s: 6 * 3600,
      wear_time_s: 2 * 3600,
      runs_count: 12,
    });

    const misplaced = await callTool(token, "create_ride", {
      bike_id: bikeId,
      ...RIDE,
      runs_count: 3,
      dry_run: true,
    });
    expect(misplaced.isError).toBe(true);
    expect(misplaced.structuredContent.errors).toEqual([
      { field: "runs_count", message: "Seulement pour une journée en bike park." },
    ]);

    const future = await callTool(token, "create_ride", {
      bike_id: bikeId,
      ...RIDE,
      on: addDays(today(), 1),
      dry_run: false,
    });
    expect(future.structuredContent.errors).toEqual([
      { field: "on", message: "La date ne peut pas être dans le futur." },
    ]);
    const noDuration = await callTool(token, "create_ride", {
      bike_id: bikeId,
      on: today(),
      ride_type: "gravel",
      dry_run: false,
    });
    expect(noDuration.structuredContent.errors[0]).toEqual({
      field: "duration_s",
      message: "Indique une durée, même approximative.",
    });
    expect(listRides(ctx, { bikeId })).toHaveLength(1);
  });

  it("list_rides filters by bike, days and type, with totals over the whole list", async () => {
    const { ctx, token } = garage("Lister");
    const enduro = addBike(ctx, "Enduro");
    const gravel = addBike(ctx, "Gravel");
    const day = (n: number) => addDays(today(), -n);
    for (const [bikeId, on, type] of [
      [enduro, day(10), "enduro"],
      [enduro, day(5), "trail"],
      [enduro, day(1), "trail"],
      [gravel, day(2), "gravel"],
    ] as const) {
      await callTool(token, "create_ride", {
        ...RIDE,
        bike_id: bikeId,
        on,
        ride_type: type,
        dry_run: false,
      });
    }

    const all = await callTool(token, "list_rides", { bike_id: enduro, limit: 2 });
    expect(all.structuredContent.rides.map((r: { on: string }) => r.on)).toEqual([day(1), day(5)]);
    expect(all.structuredContent.totals).toEqual({
      rides: 3,
      distance_m: 90_000,
      duration_s: 3 * 5400,
      wear_time_s: 3 * 5400,
    });
    expect(all.structuredContent.next_cursor).toEqual(expect.any(String));

    const trails = await callTool(token, "list_rides", {
      ride_type: "trail",
      from: day(6),
      to: day(2),
    });
    expect(trails.structuredContent.rides).toEqual([
      expect.objectContaining({ on: day(5), bike: { id: enduro, name: "Enduro" } }),
    ]);

    const bad = await callTool(token, "list_rides", { from: "hier" });
    expect(bad.structuredContent.errors).toEqual([{ field: "from", message: "Date invalide." }]);
  });

  it("update_ride changes only the fields given; delete_ride previews, then deletes", async () => {
    const { ctx, token } = garage("Editor");
    const enduro = addBike(ctx, "Enduro");
    const gravel = addBike(ctx, "Gravel");
    const created = await callTool(token, "create_ride", {
      bike_id: enduro,
      ...RIDE,
      notes: "Boue",
      dry_run: false,
    });
    const rideId = created.structuredContent.ride.id as number;

    const moved = await callTool(token, "update_ride", {
      ride_id: rideId,
      bike_id: gravel,
      distance_m: 32_000,
      dry_run: false,
    });
    expect(moved.structuredContent.ride).toMatchObject({
      id: rideId,
      bike: { id: gravel, name: "Gravel" },
      distance_m: 32_000,
      total_time_s: 5400,
      notes: "Boue",
    });
    expect(moved.structuredContent.before).toMatchObject({ distance_m: 30_000 });

    // Switching to a bike park day keeps the duration typed as its total time.
    const park = await callTool(token, "update_ride", {
      ride_id: rideId,
      ride_type: "bike_park",
      dry_run: true,
    });
    expect(park.structuredContent.ride).toMatchObject({ total_time_s: 5400, lift_assisted: true });
    expect(listRides(ctx, { bikeId: gravel })[0]?.rideType).toBe("trail");

    const preview = await callTool(token, "delete_ride", { ride_id: rideId, dry_run: true });
    expect(preview.structuredContent).toMatchObject({
      dry_run: true,
      ride: { id: rideId, distance_m: 32_000 },
      attachment_count: 0,
    });
    expect(listRides(ctx, { bikeId: gravel })).toHaveLength(1);

    // The same key in the dry run and the delete (D-100).
    const deleted = await callTool(token, "delete_ride", { ride_id: rideId, dry_run: false });
    expect(deleted.structuredContent.ride).toMatchObject({ id: rideId, distance_m: 32_000 });
    expect(deleted.structuredContent).not.toHaveProperty("deleted");
    expect(listRides(ctx)).toEqual([]);
    const gone = await callTool(token, "delete_ride", { ride_id: rideId, dry_run: false });
    expect(gone.structuredContent.errors).toEqual([
      { field: "ride_id", message: "Sortie introuvable." },
    ]);
  });
});

describe("workshop tools", () => {
  it("add_workshop_item: dry run, write, a namesake warned about, misplaced fields refused", async () => {
    const { ctx, token } = garage("Atelier");
    const sealant = {
      kind: "product",
      name: "Préventif Végétal",
      brand: "Effetto Mariposa",
      category: "wheels",
      component_type_code: "tire",
      containers: 2,
      level: "started",
      container_label: "Bidon",
    };

    const preview = await callTool(token, "add_workshop_item", { ...sealant, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent.item).toMatchObject({
      id: null,
      kind: "product",
      bikes: "all",
      stock: { containers: 2, level: "started" },
      stock_text: fr("entamé · 2~bidons"),
      container_label: "bidon",
      url: null,
    });
    expect(listInventory(ctx)).toEqual([]);

    const written = await callTool(token, "add_workshop_item", { ...sealant, dry_run: false });
    expect(written.structuredContent.item.id).toEqual(expect.any(Number));
    expect(written.structuredContent.item.url).toMatch(/\/workshop\?item=\d+$/);

    const twice = await callTool(token, "add_workshop_item", {
      ...sealant,
      name: "preventif  vegetal",
      dry_run: true,
    });
    expect(twice.structuredContent.warnings[0]).toMatch(/already has an item named/);

    const tool = await callTool(token, "add_workshop_item", {
      kind: "tool",
      name: "Clé dynamométrique",
      category: "other",
      quantity: 1,
      dry_run: false,
    });
    expect(tool.structuredContent.errors).toEqual([
      { field: "quantity", message: "Ce champ ne concerne pas ce type d'objet." },
    ]);
    const unnamed = await callTool(token, "add_workshop_item", {
      kind: "part",
      name: "  ",
      category: "brakes",
      dry_run: false,
    });
    expect(unnamed.structuredContent.errors).toEqual([
      { field: "name", message: "Donne un nom à l'objet." },
    ]);
    expect(listInventory(ctx)).toHaveLength(1);
  });

  it("list_workshop_items filters by kind, bike and words, accents ignored", async () => {
    const { ctx, token } = garage("Stock");
    const enduro = addBike(ctx, "Enduro");
    const gravel = addBike(ctx, "Gravel");
    const add = (args: Record<string, unknown>) =>
      callTool(token, "add_workshop_item", { ...args, dry_run: false });
    await add({
      kind: "part",
      name: "Plaquettes Shimano",
      category: "brakes",
      component_type_code: "brake_pads",
      quantity: 2,
      unit: "pair",
      low_stock_threshold: 1,
      bike_ids: [enduro],
    });
    await add({ kind: "part", name: "Chaîne 11v", category: "drivetrain", bike_ids: [gravel] });
    await add({ kind: "tool", name: "Fouet à cassette", category: "drivetrain", owned: false });

    const forEnduro = await callTool(token, "list_workshop_items", { bike_id: enduro });
    expect(forEnduro.structuredContent.items.map((i: { name: string }) => i.name)).toEqual([
      "Plaquettes Shimano",
      "Fouet à cassette",
    ]);
    expect(forEnduro.structuredContent.items[0]).toMatchObject({
      stock: { quantity: 2, unit: "pair" },
      stock_text: fr("2~paires"),
      rebuy_state: null,
    });

    const chain = await callTool(token, "list_workshop_items", { query: "chaine" });
    expect(chain.structuredContent.items.map((i: { name: string }) => i.name)).toEqual([
      "Chaîne 11v",
    ]);

    const rebuy = await callTool(token, "list_workshop_items", { to_rebuy: true });
    expect(rebuy.structuredContent.items).toEqual([
      expect.objectContaining({ name: "Fouet à cassette", rebuy_state: "to_order" }),
    ]);
  });

  it("to_rebuy gives each item's reason in snake_case, a tool not owned as to_order", async () => {
    const { ctx, token } = garage("Rebuy");
    const bikeId = addBike(ctx); // bought in 2021: a monthly rule is overdue
    await callTool(token, "add_component", {
      bike_id: bikeId,
      type_code: "brake_pads",
      position: "front",
      model: "Organiques",
      rules: [],
      dry_run: false,
    });
    await callTool(token, "add_rule", {
      bike_id: bikeId,
      component_type_code: "brake_pads",
      position: "front",
      title: "Contrôle des plaquettes",
      interval_days: 30,
      dry_run: false,
    });
    const add = async (args: Record<string, unknown>) =>
      (await callTool(token, "add_workshop_item", { ...args, dry_run: false })).structuredContent
        .item.id as number;
    await add({
      kind: "part",
      name: "Plaquettes",
      category: "brakes",
      component_type_code: "brake_pads",
      quantity: 1,
      unit: "pair",
      low_stock_threshold: 1,
    });
    await add({ kind: "tool", name: "Fouet à cassette", category: "drivetrain", owned: false });
    const chain = await add({
      kind: "part",
      name: "Chaîne",
      category: "drivetrain",
      link: { shop_name: "Rayon Libre", price_cents: 2990 },
    });
    for (const status of ["to_order", "ordered"]) {
      await callTool(token, "set_restock", { item_id: chain, status, dry_run: false });
    }
    await add({
      kind: "part",
      name: "Câble",
      category: "other",
      quantity: 0,
      low_stock_threshold: 1,
    });

    const rebuy = await callTool(token, "list_workshop_items", { to_rebuy: true });
    expect(
      rebuy.structuredContent.items.map((i: { name: string; rebuy_reason: unknown }) => [
        i.name,
        i.rebuy_reason,
      ]),
    ).toEqual([
      ["Plaquettes", { kind: "rule", status: "overdue", needed_on: expect.any(String) }],
      ["Fouet à cassette", { kind: "to_order", price_cents: null }],
      ["Chaîne", { kind: "ordered", ordered_on: today(), price_cents: 2990 }],
      ["Câble", { kind: "low_stock" }],
    ]);
    // Without to_rebuy, no reason; every item says whether it is archived.
    const all = await callTool(token, "list_workshop_items", {});
    expect(all.structuredContent.items[0]).not.toHaveProperty("rebuy_reason");
    expect(all.structuredContent.items[0]).toMatchObject({ archived: false });
  });

  it("update_stock: purchase, use, count, a product's level and a tool's possession", async () => {
    const { ctx, token } = garage("Moves");
    const part = await callTool(token, "add_workshop_item", {
      kind: "part",
      name: "Plaquettes",
      category: "brakes",
      quantity: 1,
      unit: "pair",
      low_stock_threshold: 1,
      dry_run: false,
    });
    const partId = part.structuredContent.item.id as number;
    const quantity = () =>
      stockQuantity(listInventory(ctx).find((i) => i.id === partId)!.movements);

    const preview = await callTool(token, "update_stock", {
      item_id: partId,
      action: "purchase",
      quantity: 2,
      unit_price_cents: 1890,
      dry_run: true,
    });
    expect(preview.structuredContent).toMatchObject({
      stock_before: fr("1~paire"),
      item: { stock_text: fr("3~paires") },
    });
    expect(quantity()).toBe(1);

    await callTool(token, "update_stock", {
      item_id: partId,
      action: "purchase",
      quantity: 2,
      unit_price_cents: 1890,
      dry_run: false,
    });
    expect(quantity()).toBe(3);
    const used = await callTool(token, "update_stock", {
      item_id: partId,
      action: "use",
      quantity: 2,
      dry_run: false,
    });
    expect(used.structuredContent.item).toMatchObject({
      stock_text: fr("1~paire"),
      rebuy_state: "low_stock",
      last_unit_cost_cents: 1890,
    });
    expect(used.structuredContent.warnings[0]).toMatch(/low stock/);

    const tooMany = await callTool(token, "update_stock", {
      item_id: partId,
      action: "use",
      quantity: 5,
      dry_run: false,
    });
    expect(tooMany.structuredContent.errors).toEqual([
      { field: "quantity", message: fr("Stock insuffisant : 1~paire en stock.") },
    ]);
    const counted = await callTool(token, "update_stock", {
      item_id: partId,
      action: "count",
      counted: 4,
      dry_run: false,
    });
    expect(counted.structuredContent.item.stock_text).toBe(fr("4~paires"));
    const level = await callTool(token, "update_stock", {
      item_id: partId,
      action: "level",
      level: "low",
      dry_run: false,
    });
    expect(level.structuredContent.errors[0]).toEqual({
      field: "action",
      message: "Seul un produit a un niveau.",
    });

    const oilId = oil(ctx);
    const finished = await callTool(token, "update_stock", {
      item_id: oilId,
      action: "level",
      level: "empty",
      dry_run: false,
    });
    expect(finished.structuredContent.item).toMatchObject({
      stock: { containers: 0 },
      stock_text: "vide",
    });

    const wrench = await callTool(token, "add_workshop_item", {
      kind: "tool",
      name: "Clé dynamométrique",
      category: "other",
      dry_run: false,
    });
    const wrenchId = wrench.structuredContent.item.id as number;
    const lost = await callTool(token, "update_stock", {
      item_id: wrenchId,
      action: "owned",
      owned: false,
      dry_run: false,
    });
    expect(lost.structuredContent.item).toMatchObject({ stock: { owned: false } });
    const same = await callTool(token, "update_stock", {
      item_id: wrenchId,
      action: "owned",
      owned: false,
      dry_run: false,
    });
    expect(same.structuredContent.changed).toBe(false);
    const wrongField = await callTool(token, "update_stock", {
      item_id: wrenchId,
      action: "owned",
      owned: true,
      quantity: 1,
      dry_run: false,
    });
    expect(wrongField.structuredContent.errors).toEqual([
      { field: "quantity", message: "Ce champ ne sert pas pour cette action." },
    ]);
  });
});

describe("procedures and what is to do", () => {
  it("list_procedures and get_procedure read the material against the workshop for a bike", async () => {
    const { ctx, token } = garage("Fiches");
    const bikeId = addBike(ctx);
    const procedureId = bleed(ctx, bikeId, oil(ctx));

    const listed = await callTool(token, "list_procedures", { bike_id: bikeId, query: "etrier" });
    expect(listed.structuredContent.procedures).toEqual([
      expect.objectContaining({
        id: procedureId,
        title: "Purge des freins",
        step_count: 2,
        readiness: { missing: 2, low: 0, label: "2 manquants" },
        readiness_for_bike: { id: bikeId, name: "Enduro" },
      }),
    ]);

    const one = await callTool(token, "get_procedure", { procedure_id: procedureId });
    expect(one.structuredContent.procedure).toMatchObject({
      steps: [
        { number: 1, instruction: "Retirer la roue" },
        { number: 2, instruction: "Serrer l'étrier", torque_nm: 6.8 },
      ],
      material_for_bike: { id: bikeId },
      material: [
        { name: "Huile minérale", kind: "product", availability: "ok" },
        { kind: "part", availability: "missing", text: "Pas dans l'atelier" },
        { name: "Seringue", kind: "other", availability: "missing" },
      ],
    });

    const unknown = await callTool(token, "get_procedure", { procedure_id: procedureId + 99 });
    expect(unknown.structuredContent.errors).toEqual([
      { field: "procedure_id", message: "Fiche introuvable." },
    ]);
  });

  it("list_due_work gives the late rules and the open tasks with their procedure's material", async () => {
    const { ctx, token } = garage("Todo");
    const bikeId = addBike(ctx); // bought on 2021-05-02: a 30-day rule is long overdue
    const procedureId = bleed(ctx, bikeId, oil(ctx));
    await callTool(token, "add_rule", {
      bike_id: bikeId,
      title: "Contrôle général",
      interval_days: 30,
      dry_run: false,
    });

    const preview = await callTool(token, "add_task", {
      bike_id: bikeId,
      title: "  Purger   le frein arrière ",
      due_on: addDays(today(), 3),
      procedure_id: procedureId,
      dry_run: true,
    });
    expect(preview.structuredContent.task).toMatchObject({
      id: null,
      title: "Purger le frein arrière",
      procedure: { id: procedureId },
    });
    expect(listOpenTasks(ctx)).toEqual([]);
    await callTool(token, "add_task", {
      bike_id: bikeId,
      title: "Purger le frein arrière",
      procedure_id: procedureId,
      dry_run: false,
    });

    const due = await callTool(token, "list_due_work", {});
    expect(due.structuredContent.rules).toEqual([
      expect.objectContaining({
        title: "Contrôle général",
        status: "overdue",
        bike: { id: bikeId, name: "Enduro" },
        interval: { unit: "days", value: 30 },
      }),
    ]);
    expect(due.structuredContent.tasks).toEqual([
      expect.objectContaining({
        title: "Purger le frein arrière",
        late: false,
        procedure: expect.objectContaining({
          id: procedureId,
          readiness: { missing: 2, low: 0, label: "2 manquants" },
        }),
      }),
    ]);

    const empty = await callTool(token, "add_task", { title: "", dry_run: false });
    expect(empty.structuredContent.errors).toEqual([
      { field: "title", message: "Donne un titre à la tâche." },
    ]);
  });
});

describe("workspace boundary and logs (D-92 tools)", () => {
  it("a token of workspace A sees and changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const bobOil = oil(b.ctx);
    const bobProcedure = bleed(b.ctx, bobBike, bobOil);
    const ride = await callTool(b.token, "create_ride", {
      bike_id: bobBike,
      ...RIDE,
      dry_run: false,
    });
    const bobRide = ride.structuredContent.ride.id as number;

    expect((await callTool(a.token, "list_rides")).structuredContent.rides).toEqual([]);
    expect((await callTool(a.token, "list_workshop_items")).structuredContent.items).toEqual([]);
    expect((await callTool(a.token, "list_procedures")).structuredContent.procedures).toEqual([]);
    const calls: [string, Record<string, unknown>, string][] = [
      ["create_ride", { bike_id: bobBike, ...RIDE, dry_run: false }, "bike_id"],
      ["update_ride", { ride_id: bobRide, notes: "x", dry_run: false }, "ride_id"],
      ["delete_ride", { ride_id: bobRide, dry_run: false }, "ride_id"],
      ["list_due_work", { bike_id: bobBike }, "bike_id"],
      ["add_task", { bike_id: bobBike, title: "Volée", dry_run: false }, "bike_id"],
      ["update_stock", { item_id: bobOil, action: "use", dry_run: false }, "item_id"],
      ["get_procedure", { procedure_id: bobProcedure }, "procedure_id"],
      ["add_task", { title: "Volée", procedure_id: bobProcedure, dry_run: false }, "procedure_id"],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, args);
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listRides(b.ctx)).toHaveLength(1);
    expect(stockQuantity(listInventory(b.ctx)[0]!.movements)).toBe(1);
  });

  it("logs each write with its ids, never what was typed; dry runs log nothing", async () => {
    const { ctx, token } = garage("Logger");
    const bikeId = addBike(ctx);
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(line));

    const ride = { bike_id: bikeId, ...RIDE, location: "Col secret" };
    await callTool(token, "create_ride", { ...ride, dry_run: true });
    expect(lines).toEqual([]);
    const created = await callTool(token, "create_ride", { ...ride, dry_run: false });
    await callTool(token, "delete_ride", {
      ride_id: created.structuredContent.ride.id,
      dry_run: false,
    });
    expect(lines.map((line) => JSON.parse(line).tool)).toEqual(["create_ride", "delete_ride"]);
    expect(JSON.parse(lines[1]!)).toMatchObject({ ride_id: created.structuredContent.ride.id });
    expect(lines.join()).not.toContain("Col secret");
    expect(lines.join()).not.toContain(token);
  });
});
