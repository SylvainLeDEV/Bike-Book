import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createAttachment,
  createBike,
  listProcedures,
  type AccessContext,
  type AttachmentData,
  type BikeData,
} from "@/server/db";
import { dataPath } from "@/server/files/storage";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The tools of D-96 through the real route: a bike's usage and cost, and writing procedures;
// refusals in French, dry runs that write nothing (and never delete a step's photos), and the
// workspace boundary.

function garage(name: string): { ctx: AccessContext; token: string } {
  const ctx = createTestContext(name);
  return { ctx, token: issueToken(ctx, "Tests").token };
}

const BIKE: BikeData = {
  name: "Gravel",
  discipline: "gravel",
  isElectric: false,
  brand: "Origine",
  model: "Graxx",
  modelYear: 2021,
  frameSize: "M",
  wheelSize: "700c",
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: "2021-05-02",
  purchasePriceCents: 150_000,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 1_000_000,
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

let counter = 0;
function photo(): AttachmentData {
  counter += 1;
  const storagePath = `uploads/2026/11/${String(counter).padStart(32, "b")}.jpg`;
  mkdirSync(path.dirname(dataPath(storagePath)), { recursive: true });
  writeFileSync(dataPath(storagePath), "original");
  return {
    kind: "photo",
    storagePath,
    originalName: "etape.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 8,
    sha256: "0".repeat(64),
    widthPx: 10,
    heightPx: 10,
    takenAt: 0,
    caption: null,
  };
}

describe("get_bike_usage", () => {
  it("gives the totals, the cost, and each part's wear with the parts before it", async () => {
    const { ctx, token } = garage("Usage");
    const bikeId = addBike(ctx);
    const part = await callTool(token, "add_component", {
      bike_id: bikeId,
      type_code: "chain",
      model: "CN-HG701",
      rules: [],
      dry_run: false,
    });
    const chain = part.structuredContent.component.id as number;
    const ride = (on: string, distance: number) =>
      callTool(token, "create_ride", {
        bike_id: bikeId,
        on,
        ride_type: "gravel",
        duration_s: 7200,
        distance_m: distance,
        dry_run: false,
      });
    await ride(addDays(today(), -3), 60_000);
    await ride(addDays(today(), -2), 40_000);
    const swap = await callTool(token, "replace_component", {
      component_id: chain,
      reason: "worn",
      on: addDays(today(), -1),
      model: "CN-M8100",
      price_cents: 4000,
      dry_run: false,
    });
    await ride(today(), 25_000);

    const usage = await callTool(token, "get_bike_usage", { bike_id: bikeId });
    expect(usage.structuredContent.totals).toMatchObject({
      distance_m: 1_125_000,
      ride_count: 3,
      last_ride_on: today(),
      last_maintenance_on: addDays(today(), -1),
    });
    expect(usage.structuredContent.cost).toMatchObject({
      purchase_cents: 150_000,
      upkeep_cents: 4000,
      total_cents: 154_000,
      ridden_distance_m: 125_000,
      per_100_km_cents: Math.round((154_000 * 100_000) / 125_000),
    });
    expect(usage.structuredContent.parts).toEqual([
      expect.objectContaining({
        component_id: swap.structuredContent.fitted.id,
        type_code: "chain",
        counter_unit: "distance_m",
        distance_m: 25_000,
        ride_count: 1,
        previous_parts: [
          expect.objectContaining({
            component_id: chain,
            removal_reason: "worn",
            removal_reason_label: "Usure",
            distance_m: 100_000,
            ride_count: 2,
          }),
        ],
      }),
    ]);
  });
});

describe("create_procedure, update_procedure, archive_procedure", () => {
  const BLEED = {
    title: "Purge des freins Shimano",
    component_type_code: "brake",
    model_hint: "Shimano XT M8120",
    estimated_duration_s: 2700,
    difficulty: "medium",
    steps: [
      { instruction: "Retirer la roue et les plaquettes" },
      { instruction: "Serrer la vis de purge", torque_nm: 4.5, note: "Sans forcer" },
    ],
    material: [{ component_type_code: "brake_pads", quantity: 1 }, { label: "Kit de purge" }],
    resources: [{ kind: "link", url: "https://si.shimano.com/fr", title: "Manuel du revendeur" }],
  };

  it("create_procedure: dry run, write, material read against the workshop", async () => {
    const { ctx, token } = garage("Writer");
    addBike(ctx);
    const oil = await callTool(token, "add_workshop_item", {
      kind: "product",
      name: "Huile minérale Shimano",
      category: "brakes",
      dry_run: false,
    });
    const oilId = oil.structuredContent.item.id as number;
    const input = { ...BLEED, material: [{ item_id: oilId }, ...BLEED.material] };

    const preview = await callTool(token, "create_procedure", { ...input, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent.procedure).toMatchObject({
      id: null,
      title: "Purge des freins Shimano",
      bikes: "all",
      estimated_duration_s: 2700,
      steps: [
        { id: null, number: 1, instruction: "Retirer la roue et les plaquettes" },
        { number: 2, torque_nm: 4.5, note: "Sans forcer" },
      ],
      material: [
        { name: "Huile minérale Shimano", availability: "ok" },
        { kind: "part", availability: "missing" },
        { name: "Kit de purge", availability: "missing" },
      ],
      readiness: { missing: 2, label: "2 manquants" },
    });
    expect(listProcedures(ctx)).toEqual([]);

    const written = await callTool(token, "create_procedure", { ...input, dry_run: false });
    expect(written.structuredContent.procedure).toMatchObject({
      id: expect.any(Number),
      steps: [{ id: expect.any(Number) }, { id: expect.any(Number) }],
      material_lines: [
        { item_id: oilId, component_type_code: null, label: null },
        { component_type_code: "brake_pads", quantity: 1 },
        { label: "Kit de purge" },
      ],
      url: expect.stringMatching(/procedure=\d+$/),
    });

    const twice = await callTool(token, "create_procedure", { ...input, dry_run: true });
    expect(twice.structuredContent.warnings[0]).toMatch(/already exists/);
  });

  it("refuses with the editor's French messages", async () => {
    const { ctx, token } = garage("Refusals");
    addBike(ctx);
    const call = (args: Record<string, unknown>) =>
      callTool(token, "create_procedure", { ...BLEED, ...args, dry_run: false });
    expect(
      (await call({ material: [{ label: "Seringue", item_id: 1 }] })).structuredContent.errors,
    ).toEqual([
      {
        field: "material[0]",
        message: "Une ligne : un objet de l'atelier, un type de pièce ou un libellé.",
      },
    ]);
    expect(
      (await call({ steps: [{ instruction: "Serrer", torque_nm: 0 }] })).structuredContent.errors,
    ).toEqual([{ field: "steps[0].torque_nm", message: "Couple de serrage invalide." }]);
    expect(
      (await call({ resources: [{ kind: "link", url: "ftp://x" }] })).structuredContent.errors,
    ).toEqual([
      {
        field: "resources[0].url",
        message: "Adresse invalide : elle doit commencer par https://",
      },
    ]);
    expect((await call({ title: " " })).structuredContent.errors).toEqual([
      { field: "title", message: "Donne un titre à la fiche." },
    ]);
    expect(listProcedures(ctx)).toEqual([]);
  });

  it("update_procedure keeps what is not given; a step removed with photos is only described in a dry run", async () => {
    const { ctx, token } = garage("Editor");
    addBike(ctx);
    const created = await callTool(token, "create_procedure", { ...BLEED, dry_run: false });
    const procedureId = created.structuredContent.procedure.id as number;
    const [first, second] = created.structuredContent.procedure.steps as { id: number }[];
    const stored = photo();
    createAttachment(ctx, { kind: "procedure_step", id: first!.id }, stored);

    const renamed = await callTool(token, "update_procedure", {
      procedure_id: procedureId,
      title: "Purge Shimano",
      dry_run: false,
    });
    expect(renamed.structuredContent.procedure).toMatchObject({
      title: "Purge Shimano",
      steps: [{ id: first!.id, photo_count: 1 }, { id: second!.id }],
      material_lines: [{ component_type_code: "brake_pads" }, { label: "Kit de purge" }],
    });

    const dropFirst = {
      procedure_id: procedureId,
      steps: [{ id: second!.id, instruction: "Serrer la vis de purge", torque_nm: 4.5 }],
    };
    const preview = await callTool(token, "update_procedure", { ...dropFirst, dry_run: true });
    expect(preview.structuredContent).toMatchObject({
      removed_steps: [{ id: first!.id }],
      warnings: [expect.stringMatching(/1 photo/)],
    });
    expect(existsSync(dataPath(stored.storagePath))).toBe(true);
    expect(listProcedures(ctx)[0]?.steps).toHaveLength(2);

    const unknownStep = await callTool(token, "update_procedure", {
      procedure_id: procedureId,
      steps: [{ id: 999_999, instruction: "x" }],
      dry_run: false,
    });
    expect(unknownStep.structuredContent.errors).toEqual([
      { field: "steps[0].id", message: "Étape introuvable sur cette fiche." },
    ]);

    await callTool(token, "update_procedure", { ...dropFirst, dry_run: false });
    expect(listProcedures(ctx)[0]?.steps.map((s) => s.id)).toEqual([second!.id]);
    expect(existsSync(dataPath(stored.storagePath))).toBe(false);

    await callTool(token, "archive_procedure", { procedure_id: procedureId, dry_run: false });
    expect((await callTool(token, "list_procedures", {})).structuredContent.procedures).toEqual([]);
  });
});

describe("workspace boundary (D-96 tools)", () => {
  it("a token of workspace A reads and changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx, "Vélo de Bob");
    const created = await callTool(b.token, "create_procedure", {
      title: "Fiche de Bob",
      dry_run: false,
    });
    const procedureId = created.structuredContent.procedure.id as number;
    const calls: [string, Record<string, unknown>, string][] = [
      ["get_bike_usage", { bike_id: bobBike }, "bike_id"],
      [
        "update_procedure",
        { procedure_id: procedureId, title: "x", dry_run: false },
        "procedure_id",
      ],
      ["archive_procedure", { procedure_id: procedureId, dry_run: false }, "procedure_id"],
      ["create_procedure", { title: "x", bike_ids: [bobBike], dry_run: false }, "bike_ids[0]"],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, args);
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listProcedures(b.ctx)[0]).toMatchObject({ title: "Fiche de Bob", archivedAt: null });
  });
});
