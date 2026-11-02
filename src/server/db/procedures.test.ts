import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dataPath } from "@/server/files/storage";
import { createTestContext } from "@/test/context";
import {
  createAttachment,
  createBike,
  createItem,
  createProcedure,
  createRule,
  createTask,
  deleteProcedure,
  linkProcedureItem,
  listAttachments,
  listOpenTasks,
  listProcedures,
  listRules,
  setProcedureArchived,
  updateProcedure,
  type AccessContext,
  type AttachmentData,
  type BikeData,
  type ProcedureData,
} from "./index";

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
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

function oil(ctx: AccessContext) {
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
    at: 0,
    today: "2026-11-02",
  });
  if (!created.ok) throw new Error(created.reason);
  return created.itemId;
}

const data = (
  bikeId: number,
  itemId: number,
  fields: Partial<ProcedureData> = {},
): ProcedureData => ({
  title: "Purge des freins",
  description: "Fictive, pour les tests.",
  componentTypeCode: "brake",
  modelHint: "SRAM Maven",
  allBikes: false,
  bikeIds: [bikeId],
  estimatedDurationS: 45 * 60,
  difficulty: "medium",
  steps: [
    { id: null, instruction: "Retirer la roue", note: null, torqueNm: null },
    { id: null, instruction: "Serrer l'étrier", note: "Sans forcer", torqueNm: 6.8 },
  ],
  items: [
    { inventoryItemId: itemId, quantity: null },
    { componentTypeCode: "brake_pads", quantity: 1 },
    { label: "Seringue", quantity: null },
  ],
  resources: [
    {
      kind: "video",
      url: "https://video.example/purge",
      title: "Purge en vidéo",
      durationS: 600,
      body: null,
    },
    { kind: "note", url: null, title: null, durationS: null, body: "Gants." },
  ],
  ...fields,
});

let counter = 0;

/** A photo row with its original written to the test data directory. */
function photo(): AttachmentData {
  counter += 1;
  const storagePath = `uploads/2026/11/${String(counter).padStart(32, "a")}.jpg`;
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

const one = (ctx: AccessContext, id: number) => listProcedures(ctx).find((p) => p.id === id)!;

describe("procedures (D-86)", () => {
  it("creates a procedure with its bikes, steps, material and links in order", () => {
    const { ctx, bikeId } = setup("Fiche");
    const itemId = oil(ctx);
    const created = createProcedure(ctx, data(bikeId, itemId));
    if (!created.ok) throw new Error(created.reason);
    expect(one(ctx, created.procedureId)).toMatchObject({
      title: "Purge des freins",
      bikeIds: [bikeId],
      estimatedDurationS: 2700,
      difficulty: "medium",
      steps: [
        { instruction: "Retirer la roue" },
        { instruction: "Serrer l'étrier", torqueNm: 6.8 },
      ],
      items: [
        { inventoryItemId: itemId },
        { componentTypeCode: "brake_pads", quantity: 1 },
        { label: "Seringue" },
      ],
      resources: [
        { kind: "video", durationS: 600 },
        { kind: "note", body: "Gants." },
      ],
    });
  });

  it("keeps a step's id and photos when edited, and removes a deleted step's files", () => {
    const { ctx, bikeId } = setup("Étapes");
    const itemId = oil(ctx);
    const created = createProcedure(ctx, data(bikeId, itemId));
    if (!created.ok) throw new Error(created.reason);
    const [first, second] = one(ctx, created.procedureId).steps;
    const kept = createAttachment(ctx, { kind: "procedure_step", id: second.id }, photo());
    const gone = createAttachment(ctx, { kind: "procedure_step", id: first.id }, photo());
    if (!kept.ok || !gone.ok) throw new Error("attachment");

    // The second step moves first, the first is removed, a new one is added.
    const outcome = updateProcedure(
      ctx,
      created.procedureId,
      data(bikeId, itemId, {
        steps: [
          { ...second, instruction: "Serrer l'étrier à la main" },
          { id: null, instruction: "Purger", note: null, torqueNm: null },
        ],
      }),
    );
    expect(outcome).toEqual({ ok: true });
    const steps = one(ctx, created.procedureId).steps;
    expect(steps.map((step) => [step.id === second.id, step.instruction])).toEqual([
      [true, "Serrer l'étrier à la main"],
      [false, "Purger"],
    ]);
    expect(listAttachments(ctx, { kind: "procedure_step", id: second.id })).toHaveLength(1);
    expect(existsSync(dataPath(kept.attachment.storagePath))).toBe(true);
    expect(existsSync(dataPath(gone.attachment.storagePath))).toBe(false);
  });

  it("refuses a step of another procedure", () => {
    const { ctx, bikeId } = setup("Mélange");
    const itemId = oil(ctx);
    const a = createProcedure(ctx, data(bikeId, itemId));
    const b = createProcedure(ctx, data(bikeId, itemId, { title: "Autre" }));
    if (!a.ok || !b.ok) throw new Error("procedure");
    const foreign = one(ctx, b.procedureId).steps[0];
    expect(updateProcedure(ctx, a.procedureId, data(bikeId, itemId, { steps: [foreign] }))).toEqual(
      { ok: false, reason: "not_found" },
    );
    expect(one(ctx, b.procedureId).steps).toHaveLength(2);
  });

  it("archives, or deletes for good: files go, rules and tasks lose the link", () => {
    const { ctx, bikeId } = setup("Suppression");
    const itemId = oil(ctx);
    const created = createProcedure(ctx, data(bikeId, itemId));
    if (!created.ok) throw new Error(created.reason);
    const procedureId = created.procedureId;
    const doc = createAttachment(ctx, { kind: "procedure", id: procedureId }, photo());
    if (!doc.ok) throw new Error("attachment");
    const rule = createRule(ctx, bikeId, {
      componentTypeCode: "brake",
      position: null,
      title: "Purge",
      intervalDistanceM: null,
      intervalWearS: null,
      intervalDays: 365,
      warnRatio: 0.9,
      resetOnReplacement: false,
      counterStartAt: 0,
      active: true,
      notes: null,
      procedureId,
    });
    const task = createTask(ctx, {
      bikeId,
      title: "Purger l'arrière",
      dueOn: null,
      notes: null,
      procedureId,
    });
    if (!rule.ok || !task.ok) throw new Error("links");
    expect(listRules(ctx, bikeId)[0].procedureId).toBe(procedureId);

    setProcedureArchived(ctx, procedureId, 1000);
    expect(one(ctx, procedureId).archivedAt).toBe(1000);

    expect(deleteProcedure(ctx, procedureId)).toEqual({ ok: true });
    expect(listProcedures(ctx)).toEqual([]);
    expect(existsSync(dataPath(doc.attachment.storagePath))).toBe(false);
    expect(listRules(ctx, bikeId)[0].procedureId).toBeNull();
    expect(listOpenTasks(ctx)[0].procedureId).toBeNull();
  });

  it("links a line typed as text to the workshop item added for it", () => {
    const { ctx, bikeId } = setup("Lien");
    const itemId = oil(ctx);
    const created = createProcedure(ctx, data(bikeId, itemId));
    if (!created.ok) throw new Error(created.reason);
    const line = one(ctx, created.procedureId).items[2];
    expect(linkProcedureItem(ctx, line.id, itemId)).toEqual({ ok: true });
    expect(one(ctx, created.procedureId).items[2]).toMatchObject({
      inventoryItemId: itemId,
    });
    expect(one(ctx, created.procedureId).items[2].label).toBeUndefined();
  });

  it("keeps each workspace's procedures to itself", () => {
    const { ctx: owner, bikeId } = setup("Propriétaire");
    const { ctx: intruder, bikeId: theirBike } = setup("Intrus");
    const itemId = oil(owner);
    const created = createProcedure(owner, data(bikeId, itemId));
    if (!created.ok) throw new Error(created.reason);
    const id = created.procedureId;
    expect(listProcedures(intruder)).toEqual([]);
    expect(updateProcedure(intruder, id, data(bikeId, itemId))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(setProcedureArchived(intruder, id, 1)).toEqual({ ok: false, reason: "not_found" });
    expect(deleteProcedure(intruder, id)).toEqual({ ok: false, reason: "not_found" });
    // Nor can it name my bike or my workshop item, or point its task to my procedure.
    expect(createProcedure(intruder, data(theirBike, itemId))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      createTask(intruder, {
        bikeId: theirBike,
        title: "X",
        dueOn: null,
        notes: null,
        procedureId: id,
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(createAttachment(intruder, { kind: "procedure", id }, photo())).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listProcedures(owner)).toHaveLength(1);
  });
});
