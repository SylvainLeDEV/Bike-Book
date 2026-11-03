import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, endOfLocalDay } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  getBike,
  listBikes,
  listComponents,
  listRules,
  listShops,
  listSuspensionSpecs,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// Every tool through the real route (D-90): normal case, a refused input with the forms' French
// messages, a dry run that writes nothing, and the workspace boundary.

function garage(name: string): { ctx: AccessContext; token: string } {
  const ctx = createTestContext(name);
  return { ctx, token: issueToken(ctx, "Tests").token };
}

const BIKE: BikeData = {
  name: "Gravel alu",
  discipline: "gravel",
  isElectric: false,
  brand: "Origine",
  model: "Graxx",
  modelYear: 2021,
  frameSize: "M",
  wheelSize: "700c",
  color: null,
  frameSerial: "WTU 123 4567 B",
  weightG: null,
  purchasedOn: "2021-05-02",
  purchasePriceCents: 150_000,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2021-05-02",
  salePriceCents: null,
  notes: null,
};

function addBike(ctx: AccessContext, name: string): number {
  const outcome = createBike(ctx, { ...BIKE, name });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.bikeId;
}

const SPECTRAL = {
  name: "Spectral",
  discipline: "enduro",
  brand: "Canyon",
  model: "Spectral CF 8",
  model_year: 2023,
  frame_size: "L",
  wheel_size: "29",
  purchased_on: "2023-04-01",
  purchase_price_cents: 429_900,
  shop: { name: "Rayon Libre", kind: "online" },
  components: [
    {
      type_code: "fork",
      brand: "Fox",
      model: "36 Factory",
      suspension: {
        spring_type: "air",
        travel_mm: 160,
        max_clicks: { low_speed_rebound: 18, low_speed_compression: 16 },
      },
    },
    { type_code: "rear_shock", brand: "Fox", model: "Float X", rules: [] },
    { type_code: "rear_derailleur", brand: "Shimano", model: "XT M8100" },
    { type_code: "brake", position: "front", brand: "SRAM", model: "Code RSC" },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("bike tools", () => {
  it("list_bikes pages through the workspace's bikes", async () => {
    const { ctx, token } = garage("Pages");
    for (const name of ["A", "B", "C"]) addBike(ctx, name);

    const first = await callTool(token, "list_bikes", { limit: 2 });
    expect(first.structuredContent.bikes.map((b: { name: string }) => b.name)).toEqual(["A", "B"]);
    expect(first.structuredContent.bikes[0]).toMatchObject({
      brand: "Origine",
      model: "Graxx",
      model_year: 2021,
      status: "active",
      url: expect.stringMatching(/\/bikes\/\d+$/),
    });
    const next = first.structuredContent.next_cursor;
    expect(next).toEqual(expect.any(String));

    const second = await callTool(token, "list_bikes", { limit: 2, cursor: next });
    expect(second.structuredContent).toMatchObject({ bikes: [{ name: "C" }], next_cursor: null });

    const unknown = await callTool(token, "list_bikes", { cursor: "nope" });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent.errors[0].field).toBe("cursor");
  });

  it("get_bike gives the record and parts, never the frame number", async () => {
    const { ctx, token } = garage("Reader");
    const bikeId = addBike(ctx, "Gravel");
    const answer = await callTool(token, "get_bike", { bike_id: bikeId });
    expect(answer.structuredContent.bike).toMatchObject({
      id: bikeId,
      name: "Gravel",
      wheel_size: "700c",
      purchase_price_cents: 150_000,
      components: [],
    });
    expect(JSON.stringify(answer)).not.toContain("WTU");
    expect(answer.structuredContent.bike).not.toHaveProperty("frame_serial");
  });

  it("create_bike: a dry run writes nothing, then the write creates bike, parts, specs and rules", async () => {
    const { ctx, token } = garage("Creator");

    const preview = await callTool(token, "create_bike", { ...SPECTRAL, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent.dry_run).toBe(true);
    expect(preview.structuredContent.bike).toMatchObject({ id: null, url: null, name: "Spectral" });
    expect(preview.structuredContent.bike.components).toHaveLength(4);
    expect(preview.structuredContent.shops_created).toEqual(["Rayon Libre"]);
    expect(preview.structuredContent.rules_created.length).toBeGreaterThan(0);
    expect(listBikes(ctx)).toEqual([]);
    expect(listShops(ctx)).toEqual([]);

    const written = await callTool(token, "create_bike", { ...SPECTRAL, dry_run: false });
    const bike = written.structuredContent.bike;
    expect(bike.url).toMatch(new RegExp(`/bikes/${bike.id}$`));
    expect(getBike(ctx, bike.id)).toMatchObject({
      name: "Spectral",
      modelYear: 2023,
      frameSerial: null,
      purchaseShop: { name: "Rayon Libre", kind: "online" },
    });

    const parts = listComponents(ctx, bike.id);
    expect(parts.map((p) => [p.typeCode, p.position, p.origin])).toEqual([
      ["fork", "none", "stock"],
      ["rear_shock", "none", "stock"],
      ["rear_derailleur", "none", "stock"],
      ["brake", "front", "stock"],
    ]);
    // Original parts count from the purchase day (D-61).
    expect(bike.components[0]).toMatchObject({ installed_on: "2023-04-01", label: "Fourche" });
    expect(listSuspensionSpecs(ctx, bike.id)).toEqual([
      expect.objectContaining({
        componentId: parts[0]!.id,
        springType: "air",
        travelMm: 160,
        maxClicks: {
          low_speed_rebound: 18,
          high_speed_rebound: null,
          low_speed_compression: 16,
          high_speed_compression: null,
        },
      }),
    ]);
    // Every template of the fork's type; none for the shock ([]).
    const rules = listRules(ctx, bike.id);
    expect(rules.some((rule) => rule.componentTypeCode === "fork")).toBe(true);
    expect(rules.some((rule) => rule.componentTypeCode === "rear_shock")).toBe(false);
    expect(written.structuredContent.rules_created).toHaveLength(rules.length);
  });

  it("create_bike refuses with the form's French messages, and writes nothing", async () => {
    const { ctx, token } = garage("Refused");
    const answer = await callTool(token, "create_bike", {
      ...SPECTRAL,
      model_year: 1800,
      components: [
        SPECTRAL.components[0],
        { type_code: "chain" },
        { type_code: "brake", brand: "SRAM", suspension: { spring_type: "air" } },
        {
          type_code: "fork",
          brand: "RockShox",
          suspension: { spring_type: "air", max_clicks: { low_speed_rebound: 0 } },
        },
        { type_code: "chain", brand: "KMC", rules: [{ template_id: 999_999 }] },
      ],
      dry_run: false,
    });
    expect(answer.isError).toBe(true);
    const errors = answer.structuredContent.errors as { field: string; message: string }[];
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "model_year", message: "Année entre 1900 et 2100." },
        { field: "components[1].model", message: "Indique au moins la marque ou le modèle." },
        { field: "components[2].position", message: "Choisis l'avant ou l'arrière." },
        {
          field: "components[3].suspension.max_clicks.low_speed_rebound",
          message: "Entre 1 et 60 clics.",
        },
        {
          field: "components[4].rules[0].template_id",
          message: "Modèle de règle inconnu pour ce type de pièce : 999999.",
        },
      ]),
    );
    expect(listBikes(ctx)).toEqual([]);
  });

  it("create_bike is all or nothing: a part refused by the database undoes the bike", async () => {
    const { ctx, token } = garage("Atomic");
    const twoForks = {
      ...SPECTRAL,
      components: [
        SPECTRAL.components[0],
        { type_code: "fork", brand: "RockShox", model: "Lyrik" },
      ],
    };
    for (const dryRun of [true, false]) {
      const answer = await callTool(token, "create_bike", { ...twoForks, dry_run: dryRun });
      expect(answer.isError).toBe(true);
      expect(answer.structuredContent.errors).toEqual([
        {
          field: "components[1].type_code",
          message: "Fourche déjà montée (Fox 36 Factory) : utilise « Remplacer une pièce ».",
        },
      ]);
    }
    expect(listBikes(ctx)).toEqual([]);
    expect(listShops(ctx)).toEqual([]);

    addBike(ctx, "Spectral");
    const taken = await callTool(token, "create_bike", {
      name: " spectral ",
      discipline: "trail",
      dry_run: true,
    });
    expect(taken.structuredContent.errors).toEqual([
      { field: "name", message: "Tu as déjà un vélo nommé « Spectral »." },
    ]);
  });

  it("update_bike changes only the fields given and keeps the frame number", async () => {
    const { ctx, token } = garage("Updater");
    const bikeId = addBike(ctx, "Gravel");

    const preview = await callTool(token, "update_bike", {
      bike_id: bikeId,
      model_year: 2022,
      color: "Vert",
      dry_run: true,
    });
    expect(preview.structuredContent.bike).toMatchObject({ model_year: 2022, color: "Vert" });
    expect(getBike(ctx, bikeId)).toMatchObject({ modelYear: 2021, color: null });

    await callTool(token, "update_bike", { bike_id: bikeId, model_year: 2022, dry_run: false });
    expect(getBike(ctx, bikeId)).toMatchObject({
      modelYear: 2022,
      model: "Graxx",
      frameSerial: "WTU 123 4567 B",
      purchasePriceCents: 150_000,
    });

    const refused = await callTool(token, "update_bike", {
      bike_id: bikeId,
      purchased_on: "2999-01-01",
      dry_run: false,
    });
    expect(refused.structuredContent.errors).toEqual([
      { field: "purchased_on", message: "La date d'achat ne peut pas être dans le futur." },
    ]);
  });
});

describe("component tools", () => {
  it("list_component_types gives codes, French labels, positions and rule templates", async () => {
    const { token } = garage("Types");
    const answer = await callTool(token, "list_component_types", { limit: 100 });
    const types = answer.structuredContent.component_types as {
      code: string;
      label: string;
      positions: string[];
      takes_suspension_specs: boolean;
      rule_templates: { id: number }[];
    }[];
    expect(types[0]).toMatchObject({
      code: "fork",
      label: "Fourche",
      group: "suspension",
      positions: ["none"],
      takes_suspension_specs: true,
    });
    expect(types[0]!.rule_templates.length).toBeGreaterThan(0);
    expect(types.find((t) => t.code === "brake")).toMatchObject({ positions: ["front", "rear"] });
    expect(answer.structuredContent.next_cursor).toBeNull();

    const page = await callTool(token, "list_component_types", { limit: 2 });
    expect(page.structuredContent.component_types).toHaveLength(2);
    expect(page.structuredContent.next_cursor).toBe("rear_shock");
  });

  it("add_component: dry run, write, refusals", async () => {
    const { ctx, token } = garage("Adder");
    const bikeId = addBike(ctx, "Gravel");
    const chain = { bike_id: bikeId, type_code: "chain", brand: "KMC", model: "X11" };

    const preview = await callTool(token, "add_component", { ...chain, dry_run: true });
    expect(preview.structuredContent.component).toMatchObject({
      id: null,
      label: "Chaîne",
      origin: "stock",
      installed_on: "2021-05-02",
    });
    expect(listComponents(ctx, bikeId)).toEqual([]);
    expect(listRules(ctx, bikeId)).toEqual([]);

    const written = await callTool(token, "add_component", {
      ...chain,
      origin: "upgrade",
      installed_on: "2024-06-01",
      purchase_price_cents: 3_990,
      dry_run: false,
    });
    const { component } = written.structuredContent;
    expect(component).toMatchObject({ origin: "upgrade", installed_on: "2024-06-01" });
    expect(listComponents(ctx, bikeId)).toEqual([
      expect.objectContaining({ id: component.id, purchasePriceCents: 3_990 }),
    ]);
    expect(written.structuredContent.rules_created).toEqual([
      expect.objectContaining({ component_type_code: "chain", interval_distance_m: 500_000 }),
    ]);

    const taken = await callTool(token, "add_component", { ...chain, dry_run: true });
    expect(taken.structuredContent.errors[0]).toMatchObject({ field: "type_code" });

    const noRules = await callTool(token, "add_component", {
      bike_id: bikeId,
      type_code: "tire",
      position: "rear",
      model: "Pathfinder",
      rules: [],
      dry_run: false,
    });
    expect(noRules.structuredContent.rules_created).toEqual([]);

    const future = await callTool(token, "add_component", {
      ...chain,
      type_code: "cassette",
      installed_on: "2999-01-01",
      dry_run: true,
    });
    expect(future.structuredContent.errors).toEqual([
      { field: "installed_on", message: "La date de montage ne peut pas être dans le futur." },
    ]);
  });

  it("a rule can count from the day it was last done, as in the Règles sheet", async () => {
    const { ctx, token } = garage("Last done");
    const bikeId = addBike(ctx, "Gravel"); // bought on 2021-05-02
    const types = await callTool(token, "list_component_types", { limit: 100 });
    const bleed = types.structuredContent.component_types
      .find((type: { code: string }) => type.code === "brake")
      .rule_templates.find((template: { code: string }) => template.code === "brake_bleed");
    const brake = { bike_id: bikeId, type_code: "brake", position: "front", model: "G2 RS" };

    // Without a day, the bleed counts from the purchase in 2021: overdue, and the preview says so.
    const preview = await callTool(token, "add_component", { ...brake, dry_run: true });
    expect(preview.structuredContent.rules_created).toEqual([
      expect.objectContaining({
        id: null,
        title: bleed.title,
        status: "overdue",
        counts_from: "2021-05-02",
      }),
    ]);
    expect(preview.structuredContent.warnings).toEqual([
      expect.stringContaining("rules[].last_done_on"),
    ]);

    const lastBleed = addDays(today(), -30);
    const written = await callTool(token, "add_component", {
      ...brake,
      rules: [{ template_id: bleed.id, last_done_on: lastBleed }],
      dry_run: false,
    });
    expect(written.structuredContent.rules_created).toEqual([
      expect.objectContaining({
        status: "ok",
        counts_from: lastBleed,
        due_on: addDays(lastBleed, 365),
      }),
    ]);
    expect(written.structuredContent.warnings).toEqual([]);
    // The end of that day (D-61), like "Dernière fois" in the Règles sheet.
    expect(listRules(ctx, bikeId)[0]!.counterStartAt).toBe(
      endOfLocalDay(lastBleed, getEnv().timeZone),
    );

    const refused = await callTool(token, "add_component", {
      ...brake,
      position: "rear",
      rules: [
        { template_id: bleed.id, last_done_on: "2999-01-01" },
        { template_id: bleed.id, last_done_on: "2026-02-30" },
      ],
      dry_run: true,
    });
    expect(refused.structuredContent.errors).toEqual([
      { field: "rules[0].last_done_on", message: "La date ne peut pas être dans le futur." },
      { field: "rules[1].last_done_on", message: "Date invalide." },
    ]);
  });

  it("refuses an unknown field instead of ignoring it, nested ones too", async () => {
    const { ctx, token } = garage("Strict");
    const bikeId = addBike(ctx, "Gravel");
    for (const args of [
      { type_code: "chain", model: "X11", rule_template_ids: [] },
      { type_code: "chain", model: "X11", rules: [{ template_id: 1, last_done: "2026-01-01" }] },
      { type_code: "chain", model: "X11", frame_serial: "WTU" },
    ]) {
      const answer = await callTool(token, "add_component", {
        bike_id: bikeId,
        ...args,
        dry_run: false,
      });
      expect(answer.isError).toBe(true);
      expect(answer.content[0]!.text).toMatch(/Input validation error/);
    }
    expect(listComponents(ctx, bikeId)).toEqual([]);
  });

  it("update_component changes only the fields given", async () => {
    const { ctx, token } = garage("Editor");
    const bikeId = addBike(ctx, "Gravel");
    const added = await callTool(token, "add_component", {
      bike_id: bikeId,
      type_code: "chain",
      brand: "KMC",
      model: "X11",
      dry_run: false,
    });
    const id = added.structuredContent.component.id as number;
    const before = listComponents(ctx, bikeId)[0]!;

    const preview = await callTool(token, "update_component", {
      component_id: id,
      notes: "Cire",
      dry_run: true,
    });
    expect(preview.structuredContent.component).toMatchObject({ id, notes: "Cire" });
    expect(listComponents(ctx, bikeId)[0]!.notes).toBeNull();

    await callTool(token, "update_component", {
      component_id: id,
      notes: "Cire",
      reference: null,
      dry_run: false,
    });
    expect(listComponents(ctx, bikeId)[0]).toEqual({
      ...before,
      notes: "Cire",
      reference: null,
    });

    const refused = await callTool(token, "update_component", {
      component_id: id,
      brand: null,
      model: null,
      dry_run: false,
    });
    expect(refused.structuredContent.errors).toEqual([
      { field: "model", message: "Indique au moins la marque ou le modèle." },
    ]);
  });

  it("set_suspension_specs merges with the current specs, forks and shocks only", async () => {
    const { ctx, token } = garage("Specs");
    const created = await callTool(token, "create_bike", { ...SPECTRAL, dry_run: false });
    const bikeId = created.structuredContent.bike.id as number;
    const [fork, shock, derailleur] = listComponents(ctx, bikeId);

    const preview = await callTool(token, "set_suspension_specs", {
      component_id: fork!.id,
      max_clicks: { high_speed_compression: 8 },
      dry_run: true,
    });
    expect(preview.structuredContent.component.suspension).toMatchObject({
      spring_type: "air",
      travel_mm: 160,
      max_clicks: { low_speed_rebound: 18, high_speed_compression: 8 },
    });
    expect(listSuspensionSpecs(ctx, bikeId)[0]!.maxClicks.high_speed_compression).toBeNull();

    const noSpring = await callTool(token, "set_suspension_specs", {
      component_id: shock!.id,
      travel_mm: 65,
      dry_run: true,
    });
    expect(noSpring.structuredContent.errors).toEqual([
      { field: "spring_type", message: "Choisis air ou ressort." },
    ]);

    await callTool(token, "set_suspension_specs", {
      component_id: shock!.id,
      spring_type: "coil",
      travel_mm: 65,
      wheel_travel_mm: 160,
      dry_run: false,
    });
    expect(listSuspensionSpecs(ctx, bikeId).find((s) => s.componentId === shock!.id)).toMatchObject(
      { springType: "coil", travelMm: 65, wheelTravelMm: 160 },
    );

    const notSuspension = await callTool(token, "set_suspension_specs", {
      component_id: derailleur!.id,
      spring_type: "air",
      dry_run: true,
    });
    expect(notSuspension.structuredContent.errors[0].field).toBe("component_id");
  });
});

describe("workspace boundary and logs", () => {
  it("a token of workspace A sees and changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const bobPart = await callTool(b.token, "add_component", {
      bike_id: bobBike,
      type_code: "chain",
      model: "X11",
      dry_run: false,
    });
    const bobPartId = bobPart.structuredContent.component.id as number;

    expect((await callTool(a.token, "list_bikes")).structuredContent.bikes).toEqual([]);
    const calls: [string, Record<string, unknown>, string][] = [
      ["get_bike", { bike_id: bobBike }, "bike_id"],
      ["update_bike", { bike_id: bobBike, name: "Volé", dry_run: false }, "bike_id"],
      [
        "add_component",
        { bike_id: bobBike, type_code: "cassette", model: "XT", dry_run: false },
        "bike_id",
      ],
      ["update_component", { component_id: bobPartId, notes: "x", dry_run: false }, "component_id"],
      [
        "set_suspension_specs",
        { component_id: bobPartId, spring_type: "air", dry_run: false },
        "component_id",
      ],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, args);
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(getBike(b.ctx, bobBike)?.name).toBe("Vélo de Bob");
    expect(listComponents(b.ctx, bobBike)).toHaveLength(1);
  });

  it("logs each write with its ids, never the token nor what was typed", async () => {
    const { ctx, token } = garage("Logger");
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(line));

    await callTool(token, "create_bike", { ...SPECTRAL, dry_run: true });
    expect(lines).toEqual([]);
    await callTool(token, "create_bike", { ...SPECTRAL, dry_run: false });
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]!);
    expect(line).toMatchObject({
      event: "mcp_write",
      tool: "create_bike",
      workspace_id: ctx.workspace.id,
      token_id: expect.any(Number),
      bike_id: expect.any(Number),
      component_ids: expect.any(Array),
    });
    expect(lines[0]).not.toContain(token);
    expect(lines[0]).not.toContain("Spectral");
  });
});
