import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import { createBike, createTask, listOpenTasks, setTaskStatus, type BikeData } from "./index";
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
    expect(setTaskStatus(ctx, created.taskId, "done", Date.parse("2026-10-26T10:00:00Z"))).toEqual({
      ok: true,
      previous: "open",
    });
    expect(listOpenTasks(ctx)).toEqual([]);
    expect(setTaskStatus(ctx, created.taskId, "open", Date.now())).toEqual({
      ok: true,
      previous: "done",
    });
    expect(listOpenTasks(ctx)).toHaveLength(1);
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
