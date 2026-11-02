import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { itemStock } from "@/server/domain/inventory";
import { dataPath } from "@/server/files/storage";
import { createTestContext } from "@/test/context";
import {
  abandonRun,
  addRunStep,
  createAttachment,
  createBike,
  createItem,
  createMaintenanceEvent,
  createProcedure,
  createRule,
  createTask,
  deleteMaintenanceEvent,
  finishRun,
  getRun,
  listInventory,
  listMaintenanceEvents,
  listOpenTasks,
  listProcedures,
  listRunsInProgress,
  removeRunStep,
  startRun,
  undoFinishRun,
  updateRunStep,
  type AccessContext,
  type AttachmentData,
  type BikeData,
  type FinishRunData,
} from "./index";

const NOW = Date.parse("2026-11-02T10:00:00Z");

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

function garage(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  const bikeId = created.bikeId;
  const item = (kind: "part" | "product", initialQuantity: number) => {
    const made = createItem(ctx, {
      kind,
      name: kind === "part" ? "Joints" : "Huile",
      brand: null,
      reference: null,
      category: "brakes",
      componentTypeCode: null,
      allBikes: true,
      bikeIds: [],
      unit: "piece",
      lowStockThreshold: null,
      containerLabel: null,
      location: null,
      notes: null,
      initialQuantity,
      link: null,
      at: 0,
      today: "2026-11-01",
    });
    if (!made.ok) throw new Error("item");
    return made.itemId;
  };
  const partId = item("part", 3);
  const productId = item("product", 1);
  const procedure = createProcedure(ctx, {
    title: "Purge des freins",
    description: null,
    componentTypeCode: "brake",
    modelHint: null,
    allBikes: false,
    bikeIds: [bikeId],
    estimatedDurationS: 2700,
    difficulty: null,
    steps: [
      { id: null, instruction: "Vider", note: null, torqueNm: null },
      { id: null, instruction: "Serrer", note: null, torqueNm: 6.8 },
    ],
    items: [{ inventoryItemId: partId, quantity: 2 }],
    resources: [],
  });
  if (!procedure.ok) throw new Error("procedure");
  return { ctx, bikeId, partId, productId, procedureId: procedure.procedureId };
}

const finish = (fields: Partial<FinishRunData> = {}): FinishRunData => ({
  at: NOW,
  performedOn: "2026-11-02",
  title: "Purge des freins",
  notes: "RAS",
  laborTimeS: 3600,
  line: { action: "bled", componentId: null, ruleId: null, costCents: 1200 },
  joinEventId: null,
  parts: [],
  products: [],
  saveAsProcedure: false,
  ...fields,
});

let counter = 0;
function photo(): AttachmentData {
  counter += 1;
  const storagePath = `uploads/2026/11/${String(counter).padStart(32, "b")}.jpg`;
  mkdirSync(path.dirname(dataPath(storagePath)), { recursive: true });
  writeFileSync(dataPath(storagePath), "original");
  return {
    kind: "photo",
    storagePath,
    originalName: "suivi.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 8,
    sha256: "0".repeat(64),
    widthPx: 10,
    heightPx: 10,
    takenAt: 0,
    caption: null,
  };
}

const stock = (ctx: AccessContext, itemId: number) => {
  const item = listInventory(ctx).find((i) => i.id === itemId)!;
  return itemStock(item.kind, item.movements);
};

describe("runs (D-87)", () => {
  it("starts from a procedure with a copy of its steps, and resumes the one in progress", () => {
    const { ctx, bikeId, procedureId } = garage("Début");
    const started = startRun(ctx, { from: "procedure", procedureId, bikeId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    expect(started.resumed).toBe(false);
    expect(getRun(ctx, started.runId)).toMatchObject({
      title: "Purge des freins",
      status: "in_progress",
      bikeId,
      procedureId,
      steps: [{ instruction: "Vider" }, { instruction: "Serrer", torqueNm: 6.8 }],
    });
    expect(startRun(ctx, { from: "procedure", procedureId, bikeId }, NOW)).toEqual({
      ok: true,
      runId: started.runId,
      resumed: true,
    });
    expect(listRunsInProgress(ctx).map((run) => run.id)).toEqual([started.runId]);
  });

  it("checks, comments, adds and removes steps; abandoning deletes it with its photos", () => {
    const { ctx, bikeId, procedureId } = garage("Étapes");
    const started = startRun(ctx, { from: "procedure", procedureId, bikeId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    const [first] = getRun(ctx, started.runId)!.steps;
    updateRunStep(ctx, first.id, { done: true, comment: "Bulles au début" }, NOW);
    const added = addRunStep(ctx, started.runId, "Nettoyer l'étrier");
    if (!added.ok) throw new Error(added.reason);
    const shot = createAttachment(ctx, { kind: "procedure_run_step", id: first.id }, photo());
    if (!shot.ok) throw new Error("photo");
    expect(getRun(ctx, started.runId)!.steps).toMatchObject([
      { doneAt: NOW, comment: "Bulles au début", photoCount: 1 },
      { doneAt: null },
      { instruction: "Nettoyer l'étrier", procedureStepId: null },
    ]);
    expect(removeRunStep(ctx, added.stepId)).toEqual({ ok: true });
    expect(getRun(ctx, started.runId)!.steps).toHaveLength(2);

    expect(abandonRun(ctx, started.runId)).toEqual({ ok: true });
    expect(getRun(ctx, started.runId)).toBeNull();
    expect(existsSync(dataPath(shot.attachment.storagePath))).toBe(false);
  });

  it("finishes a task's run in one transaction, and « Annuler » puts everything back", () => {
    const { ctx, bikeId, partId, productId, procedureId } = garage("Fin");
    const task = createTask(ctx, {
      bikeId,
      title: "Purger l'avant",
      dueOn: null,
      notes: null,
      procedureId,
    });
    if (!task.ok) throw new Error("task");
    const started = startRun(ctx, { from: "task", taskId: task.taskId }, NOW);
    if (!started.ok) throw new Error(started.reason);

    const done = finishRun(
      ctx,
      started.runId,
      finish({
        parts: [{ itemId: partId, quantity: 2 }],
        products: [{ itemId: productId, levelAfter: "started" }],
      }),
    );
    if (!done.ok) throw new Error(done.reason);
    expect(done.eventCreated).toBe(true);
    const [event] = listMaintenanceEvents(ctx, bikeId);
    expect(event).toMatchObject({
      title: "Purge des freins",
      performedBy: "self",
      items: [{ action: "bled", costCents: 1200 }],
    });
    expect(stock(ctx, partId)).toEqual({ kind: "part", quantity: 1 });
    expect(stock(ctx, productId)).toEqual({ kind: "product", containers: 1, level: "started" });
    expect(listOpenTasks(ctx)).toEqual([]);
    expect(getRun(ctx, started.runId)).toMatchObject({
      status: "done",
      maintenanceEventId: done.eventId,
    });

    expect(undoFinishRun(ctx, done)).toEqual({ ok: true });
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);
    expect(stock(ctx, partId)).toEqual({ kind: "part", quantity: 3 });
    expect(stock(ctx, productId)).toEqual({ kind: "product", containers: 1, level: "full" });
    expect(listOpenTasks(ctx).map((t) => t.id)).toEqual([task.taskId]);
    expect(getRun(ctx, started.runId)).toMatchObject({ status: "in_progress" });
  });

  it("refuses to take more parts than the stock holds, and changes nothing", () => {
    const { ctx, bikeId, partId, procedureId } = garage("Stock");
    const started = startRun(ctx, { from: "procedure", procedureId, bikeId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    expect(
      finishRun(ctx, started.runId, finish({ parts: [{ itemId: partId, quantity: 9 }] })),
    ).toEqual({ ok: false, reason: "stock" });
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);
    expect(getRun(ctx, started.runId)?.status).toBe("in_progress");
  });

  it("joins the event of a replacement made that day; « Annuler » keeps that event", () => {
    const { ctx, bikeId, procedureId } = garage("Rejoint");
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
    if (!rule.ok) throw new Error("rule");
    const other = createMaintenanceEvent(ctx, {
      bikeId,
      performedOn: "2026-11-02",
      title: "Plaquettes remplacées",
      performedBy: "self",
      shop: null,
      totalCostCents: null,
      notes: "Avant",
      recordedAt: NOW,
      lines: [
        {
          action: "cleaned",
          componentId: null,
          ruleId: null,
          description: null,
          costCents: null,
          measurementValue: null,
          measurementUnit: null,
        },
      ],
    });
    if (!other.ok) throw new Error("event");
    const started = startRun(ctx, { from: "rule", ruleId: rule.ruleId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    const done = finishRun(
      ctx,
      started.runId,
      finish({
        joinEventId: other.eventId,
        line: { action: "bled", componentId: null, ruleId: rule.ruleId, costCents: null },
      }),
    );
    if (!done.ok) throw new Error(done.reason);
    expect(done.eventCreated).toBe(false);
    const [event] = listMaintenanceEvents(ctx, bikeId);
    expect(event.items.map((item) => item.action).sort()).toEqual(["bled", "cleaned"]);
    expect(event.notes).toBe("Avant\n\nRAS");

    expect(undoFinishRun(ctx, done)).toEqual({ ok: true });
    const [kept] = listMaintenanceEvents(ctx, bikeId);
    expect(kept).toMatchObject({
      id: other.eventId,
      notes: "Avant",
      items: [{ action: "cleaned" }],
    });
  });

  it("deleting the event later deletes the run and its photos, and gives the stock back", () => {
    const { ctx, bikeId, partId, procedureId } = garage("Suppression");
    const started = startRun(ctx, { from: "procedure", procedureId, bikeId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    const [first] = getRun(ctx, started.runId)!.steps;
    const shot = createAttachment(ctx, { kind: "procedure_run_step", id: first.id }, photo());
    if (!shot.ok) throw new Error("photo");
    const done = finishRun(
      ctx,
      started.runId,
      finish({ parts: [{ itemId: partId, quantity: 1 }] }),
    );
    if (!done.ok || done.eventId == null) throw new Error("finish");
    expect(stock(ctx, partId)).toEqual({ kind: "part", quantity: 2 });

    expect(deleteMaintenanceEvent(ctx, done.eventId)).toEqual({ ok: true });
    expect(getRun(ctx, started.runId)).toBeNull();
    expect(existsSync(dataPath(shot.attachment.storagePath))).toBe(false);
    expect(stock(ctx, partId)).toEqual({ kind: "part", quantity: 3 });
  });

  it("follows a general task without an event, and can keep its steps as a procedure", () => {
    const { ctx } = garage("Général");
    const task = createTask(ctx, {
      bikeId: null,
      title: "Ranger l'atelier",
      dueOn: null,
      notes: null,
    });
    if (!task.ok) throw new Error("task");
    const started = startRun(ctx, { from: "task", taskId: task.taskId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    expect(getRun(ctx, started.runId)).toMatchObject({
      bikeId: null,
      title: "Ranger l'atelier",
      steps: [],
    });
    addRunStep(ctx, started.runId, "Trier les vis");
    const done = finishRun(
      ctx,
      started.runId,
      finish({ title: "Ranger l'atelier", line: null, saveAsProcedure: true }),
    );
    if (!done.ok) throw new Error(done.reason);
    expect(done.eventId).toBeNull();
    expect(listOpenTasks(ctx)).toEqual([]);
    const saved = listProcedures(ctx).find((p) => p.id === done.procedureId);
    expect(saved).toMatchObject({
      title: "Ranger l'atelier",
      steps: [{ instruction: "Trier les vis" }],
    });

    expect(undoFinishRun(ctx, done)).toEqual({ ok: true });
    expect(listProcedures(ctx).some((p) => p.id === done.procedureId)).toBe(false);
    expect(getRun(ctx, started.runId)).toMatchObject({ status: "in_progress", procedureId: null });
  });

  it("keeps each workspace's runs to itself", () => {
    const { ctx: owner, bikeId, procedureId } = garage("Propriétaire");
    const { ctx: intruder, bikeId: theirBike } = garage("Intrus");
    const started = startRun(owner, { from: "procedure", procedureId, bikeId }, NOW);
    if (!started.ok) throw new Error(started.reason);
    const [first] = getRun(owner, started.runId)!.steps;
    expect(getRun(intruder, started.runId)).toBeNull();
    expect(updateRunStep(intruder, first.id, { done: true }, NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(abandonRun(intruder, started.runId)).toEqual({ ok: false, reason: "not_found" });
    expect(finishRun(intruder, started.runId, finish())).toEqual({
      ok: false,
      reason: "not_found",
    });
    // Nor start a run of my procedure on its bike.
    expect(startRun(intruder, { from: "procedure", procedureId, bikeId: theirBike }, NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      createAttachment(intruder, { kind: "procedure_run_step", id: first.id }, photo()),
    ).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
