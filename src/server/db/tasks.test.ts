import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import {
  createBike,
  createTask,
  deleteTask,
  getRun,
  listDoneTasks,
  listOpenTasks,
  setTaskStatus,
  startRun,
  updateTask,
  type BikeData,
} from "./index";
import { tasks } from "./schema";

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

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

describe("tasks", () => {
  it("lists open tasks by due date, undated last, and per bike", () => {
    const { ctx, bikeId } = setup("Camille");
    createTask(ctx, { bikeId: null, title: "Regonfler la pompe", dueOn: null, notes: null });
    createTask(ctx, { bikeId, title: "Pivots", dueOn: "2026-10-31", notes: null });
    createTask(ctx, { bikeId, title: "Jeu de direction", dueOn: "2026-10-28", notes: null });
    expect(listOpenTasks(ctx).map((t) => t.title)).toEqual([
      "Jeu de direction",
      "Pivots",
      "Regonfler la pompe",
    ]);
    expect(listOpenTasks(ctx, bikeId)).toHaveLength(2);
  });

  it("marks a task done, and open again for 'Annuler'", () => {
    const { ctx } = setup("Alex");
    const created = createTask(ctx, { bikeId: null, title: "Pompe", dueOn: null, notes: null });
    if (!created.ok) throw new Error(created.reason);
    const doneAt = Date.parse("2026-10-26T10:00:00Z");
    expect(setTaskStatus(ctx, created.taskId, "done", doneAt)).toEqual({
      ok: true,
      previous: "open",
      previousDoneAt: null,
    });
    expect(listOpenTasks(ctx)).toEqual([]);
    expect(setTaskStatus(ctx, created.taskId, "open", Date.now())).toEqual({
      ok: true,
      previous: "done",
      previousDoneAt: doneAt,
    });
    expect(listOpenTasks(ctx)).toHaveLength(1);
    expect(listDoneTasks(ctx)).toEqual([]);
  });

  it("lists done tasks last done first, per bike, without the cancelled ones (D-77)", () => {
    const { ctx, bikeId } = setup("History");
    const add = (title: string, onBike: boolean) => {
      const created = createTask(ctx, {
        bikeId: onBike ? bikeId : null,
        title,
        dueOn: null,
        notes: null,
      });
      if (!created.ok) throw new Error(created.reason);
      return created.taskId;
    };
    const pump = add("Pompe", false);
    const pivots = add("Pivots", true);
    const headset = add("Jeu de direction", true);
    add("Encore à faire", true);
    const dropped = add("Abandonnée", true);
    setTaskStatus(ctx, pivots, "done", Date.parse("2026-10-20T08:00:00Z"));
    setTaskStatus(ctx, pump, "done", Date.parse("2026-10-24T08:00:00Z"));
    setTaskStatus(ctx, headset, "done", Date.parse("2026-10-22T08:00:00Z"));
    getDb().update(tasks).set({ status: "cancelled" }).where(eq(tasks.id, dropped)).run();

    expect(listDoneTasks(ctx).map((t) => [t.title, t.doneAt])).toEqual([
      ["Pompe", Date.parse("2026-10-24T08:00:00Z")],
      ["Jeu de direction", Date.parse("2026-10-22T08:00:00Z")],
      ["Pivots", Date.parse("2026-10-20T08:00:00Z")],
    ]);
    expect(listDoneTasks(ctx, { bikeId }).map((t) => t.title)).toEqual([
      "Jeu de direction",
      "Pivots",
    ]);
    expect(listDoneTasks(ctx, { limit: 1 }).map((t) => t.title)).toEqual(["Pompe"]);
    expect(listDoneTasks(setup("Intruder").ctx)).toEqual([]);
  });

  it("keeps each workspace's tasks to itself", () => {
    const { ctx: owner, bikeId } = setup("Owner");
    const { ctx: intruder } = setup("Intruder");
    const created = createTask(owner, { bikeId, title: "Pivots", dueOn: null, notes: null });
    if (!created.ok) throw new Error(created.reason);
    expect(listOpenTasks(intruder)).toEqual([]);
    expect(createTask(intruder, { bikeId, title: "X", dueOn: null, notes: null })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(setTaskStatus(intruder, created.taskId, "done", Date.now())).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listOpenTasks(owner)).toHaveLength(1);
  });

  it("lets the database refuse a done task without its date", () => {
    const { ctx } = setup("Check");
    expect(() =>
      getDb()
        .insert(tasks)
        .values({ workspaceId: ctx.workspace.id, title: "X", status: "done" })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("updateTask", () => {
  it("changes a task of the workspace, and refuses another workspace's task or bike", () => {
    const ctx = createTestContext("Edit");
    const created = createTask(ctx, { bikeId: null, title: "Pompe", dueOn: null, notes: null });
    if (!created.ok) throw new Error("task");
    const data = { bikeId: null, title: "Regonfler la pompe", dueOn: "2026-11-02", notes: "Joint" };
    expect(updateTask(ctx, created.taskId, data)).toEqual({ ok: true });
    expect(listOpenTasks(ctx)).toMatchObject([{ id: created.taskId, ...data }]);

    const other = createTestContext("Other");
    const theirs = createBike(other, { ...bike, name: "Vélo d'Other" });
    if (!theirs.ok) throw new Error("bike");
    expect(updateTask(other, created.taskId, data)).toEqual({ ok: false, reason: "not_found" });
    expect(updateTask(ctx, created.taskId, { ...data, bikeId: theirs.bikeId })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("deleteTask (D-110)", () => {
  it("deletes an open task with its run in progress, and refuses a done or foreign one", () => {
    const { ctx, bikeId } = setup("Delete");
    const add = (title: string) => {
      const created = createTask(ctx, { bikeId, title, dueOn: null, notes: null });
      if (!created.ok) throw new Error(created.reason);
      return created.taskId;
    };
    const grease = add("Graissage chaîne");
    const done = add("Pivots");
    setTaskStatus(ctx, done, "done", Date.now());
    const run = startRun(ctx, { from: "task", taskId: grease }, Date.now());
    if (!run.ok) throw new Error(run.reason);

    expect(deleteTask(setup("Intruder").ctx, grease)).toEqual({ ok: false, reason: "not_found" });
    expect(deleteTask(ctx, done)).toEqual({ ok: false, reason: "not_found" });
    expect(deleteTask(ctx, grease)).toEqual({ ok: true });
    expect(listOpenTasks(ctx)).toEqual([]);
    expect(getRun(ctx, run.runId)).toBeNull();
    expect(listDoneTasks(ctx)).toHaveLength(1);
  });

  it("deletes a general task with its run in progress (a run needs a bike or a task)", () => {
    const { ctx } = setup("General");
    const created = createTask(ctx, { bikeId: null, title: "Pompe", dueOn: null, notes: null });
    if (!created.ok) throw new Error(created.reason);
    const run = startRun(ctx, { from: "task", taskId: created.taskId }, Date.now());
    if (!run.ok) throw new Error(run.reason);
    expect(deleteTask(ctx, created.taskId)).toEqual({ ok: true });
    expect(getRun(ctx, run.runId)).toBeNull();
  });
});
