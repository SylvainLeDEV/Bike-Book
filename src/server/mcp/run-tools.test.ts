import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import {
  createBike,
  getComponent,
  listInventory,
  listMaintenanceEvents,
  listRunsInProgress,
  listSetups,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { itemStock } from "@/server/domain/inventory";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The tools of D-98 through the real route: a run from start to "Terminer", its undo through
// delete_maintenance, "Abandonner", and the setups' corrections; refusals in French, dry runs that
// write nothing, and the workspace boundary.

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

const write = async (token: string, tool: string, args: Record<string, unknown>) =>
  (await callTool(token, tool, { ...args, dry_run: false })).structuredContent;

const stockOf = (ctx: AccessContext, itemId: number) => {
  const item = listInventory(ctx).find((i) => i.id === itemId)!;
  return itemStock(item.kind, item.movements);
};

/** A bike whose rear brake bleed is due, with its procedure and the workshop's oil and pads. */
async function bleedDue(token: string, ctx: AccessContext) {
  const bikeId = addBike(ctx); // bought in 2021: a yearly rule is overdue
  const brake = (
    await write(token, "add_component", {
      bike_id: bikeId,
      type_code: "brake",
      position: "rear",
      model: "Code RSC",
      rules: [],
    })
  ).component.id as number;
  const oil = (
    await write(token, "add_workshop_item", {
      kind: "product",
      name: "Liquide DOT 5.1",
      category: "brakes",
      component_type_code: "brake",
    })
  ).item.id as number;
  const pads = (
    await write(token, "add_workshop_item", {
      kind: "part",
      name: "Plaquettes",
      category: "brakes",
      component_type_code: "brake_pads",
      quantity: 2,
      unit: "pair",
    })
  ).item.id as number;
  const procedureId = (
    await write(token, "create_procedure", {
      title: "Purge du frein arrière",
      component_type_code: "brake",
      estimated_duration_s: 2700,
      steps: [{ instruction: "Retirer la roue" }, { instruction: "Purger", torque_nm: 4 }],
      material: [{ item_id: oil }, { component_type_code: "brake_pads", quantity: 1 }],
    })
  ).procedure.id as number;
  const ruleId = (
    await write(token, "add_rule", {
      bike_id: bikeId,
      component_type_code: "brake",
      position: "rear",
      title: "Purge arrière",
      interval_days: 365,
    })
  ).rule.id as number;
  await write(token, "update_rule", { rule_id: ruleId, procedure_id: procedureId });
  return { bikeId, brake, oil, pads, procedureId, ruleId };
}

describe("runs", () => {
  it("start_run, update_run_steps, finish_run, and delete_maintenance as its undo", async () => {
    const { ctx, token } = garage("Run");
    const { bikeId, brake, oil, pads, ruleId } = await bleedDue(token, ctx);

    const preview = await callTool(token, "start_run", { rule_id: ruleId, dry_run: true });
    expect(preview.structuredContent.run).toMatchObject({
      id: null,
      title: "Purge du frein arrière",
    });
    expect(listRunsInProgress(ctx)).toEqual([]);

    const started = await write(token, "start_run", { rule_id: ruleId });
    const runId = started.run.id as number;
    expect(started.run).toMatchObject({
      steps: [{ instruction: "Retirer la roue", done: false }, { torque_nm: 4 }],
      summary: {
        writes_event: true,
        default_component_id: brake,
        default_rule_id: ruleId,
        parts: [{ item_id: pads, default_quantity: 1 }],
        products: [{ item_id: oil, level: "full", default_level_after: "started" }],
        labor_time_s: 2700,
      },
    });
    expect((await write(token, "start_run", { rule_id: ruleId })).resumed).toBe(true);

    const [first, second] = started.run.steps as { id: number }[];
    const checked = await write(token, "update_run_steps", {
      run_id: runId,
      steps: [{ step_id: first!.id, done: true, comment: "Roue sur le pied" }],
    });
    expect(checked.run.steps[0]).toMatchObject({ done: true, comment: "Roue sur le pied" });
    const unknown = await callTool(token, "update_run_steps", {
      run_id: runId,
      steps: [{ step_id: 999_999, done: true }],
      dry_run: false,
    });
    expect(unknown.structuredContent.errors).toEqual([
      { field: "steps[0].step_id", message: "Étape introuvable sur ce suivi." },
    ]);

    const tooMany = await callTool(token, "finish_run", {
      run_id: runId,
      parts: [{ item_id: pads, quantity: 5 }],
      dry_run: false,
    });
    expect(tooMany.structuredContent.errors).toEqual([
      {
        field: "parts",
        message: "Il n'y a pas assez de stock pour une des pièces : baisse la quantité.",
      },
    ]);
    const future = await callTool(token, "finish_run", {
      run_id: runId,
      performed_on: addDays(today(), 1),
      dry_run: false,
    });
    expect(future.structuredContent.errors).toEqual([
      { field: "performed_on", message: "La date ne peut pas être dans le futur." },
    ]);

    const dry = await callTool(token, "finish_run", { run_id: runId, dry_run: true });
    expect(dry.structuredContent).toMatchObject({
      line: { action: "serviced", component_id: brake, rule_id: ruleId },
      rule_restarted: { id: ruleId, status: "ok" },
      warnings: [expect.stringMatching(/étape 2 n'est pas cochée/)],
    });
    expect(stockOf(ctx, pads)).toMatchObject({ quantity: 2 });

    await write(token, "update_run_steps", {
      run_id: runId,
      steps: [{ step_id: second!.id, done: true }],
    });
    const finished = await write(token, "finish_run", { run_id: runId, notes: "Purge propre" });
    expect(finished.event_id).toEqual(expect.any(Number));
    expect(finished.warnings).toEqual([]);
    expect(stockOf(ctx, pads)).toMatchObject({ quantity: 1 });
    expect(stockOf(ctx, oil)).toMatchObject({ containers: 1, level: "started" });
    const due = await callTool(token, "list_due_work", { bike_id: bikeId });
    expect(due.structuredContent.rules).toEqual([]);
    expect(
      (await callTool(token, "get_run", { run_id: runId })).structuredContent.run,
    ).toMatchObject({ status: "done", summary: null });

    const undo = await write(token, "delete_maintenance", { event_id: finished.event_id });
    expect(undo).toMatchObject({
      run_deleted: true,
      rules_after: [{ id: ruleId, status: "overdue" }],
    });
    expect(stockOf(ctx, pads)).toMatchObject({ quantity: 2 });
    expect(stockOf(ctx, oil)).toMatchObject({ level: "full" });
  });

  it("abandon_run deletes a run in progress; a dry run keeps it", async () => {
    const { ctx, token } = garage("Abandon");
    const { bikeId, procedureId } = await bleedDue(token, ctx);
    const started = await write(token, "start_run", { procedure_id: procedureId, bike_id: bikeId });
    const runId = started.run.id as number;
    const preview = await callTool(token, "abandon_run", { run_id: runId, dry_run: true });
    expect(preview.structuredContent).toMatchObject({ run: { steps: 2 }, photo_count: 0 });
    expect(listRunsInProgress(ctx)).toHaveLength(1);
    await write(token, "abandon_run", { run_id: runId });
    expect(listRunsInProgress(ctx)).toEqual([]);

    const bad = await callTool(token, "start_run", { procedure_id: procedureId, dry_run: true });
    expect(bad.structuredContent.errors).toEqual([
      { field: "input", message: "Indique une tâche, une règle, ou une fiche avec son vélo." },
    ]);
  });
});

describe("delete_maintenance", () => {
  it("undoes a replacement: the old part is fitted again", async () => {
    const { ctx, token } = garage("Undo swap");
    const bikeId = addBike(ctx);
    const chain = (
      await write(token, "add_component", {
        bike_id: bikeId,
        type_code: "chain",
        model: "CN-HG701",
        rules: [],
      })
    ).component.id as number;
    const swap = await write(token, "replace_component", {
      component_id: chain,
      reason: "worn",
      model: "CN-M8100",
    });
    const preview = await callTool(token, "delete_maintenance", {
      event_id: swap.event_id,
      dry_run: true,
    });
    expect(preview.structuredContent).toMatchObject({
      replacements_undone: 1,
      attachment_count: 0,
    });
    expect(getComponent(ctx, chain)?.removedAt).not.toBeNull();

    await write(token, "delete_maintenance", { event_id: swap.event_id });
    expect(getComponent(ctx, chain)?.removedAt).toBeNull();
    expect(listMaintenanceEvents(ctx, bikeId)).toEqual([]);
  });
});

describe("update_setup and delete_setup", () => {
  it("corrects a setup in place, and deleting the current one makes the previous current", async () => {
    const { ctx, token } = garage("Setups");
    const bikeId = addBike(ctx);
    await write(token, "add_component", {
      bike_id: bikeId,
      type_code: "fork",
      model: "36",
      rules: [],
      suspension: { spring_type: "air", travel_mm: 160, max_clicks: { low_speed_rebound: 18 } },
    });
    const old = await write(token, "add_setup", {
      bike_id: bikeId,
      set_on: addDays(today(), -7),
      fork: { air_pressure_psi: 85 },
    });
    const current = await write(token, "add_setup", {
      bike_id: bikeId,
      fork: { air_pressure_psi: 90 },
    });

    const corrected = await write(token, "update_setup", {
      setup_id: current.setup.id,
      label: "Bike park",
      fork: { air_pressure_psi: 92, clicks: { low_speed_rebound: 6 } },
    });
    expect(corrected.setup).toMatchObject({
      label: "Bike park",
      suspensions: [{ air_pressure_psi: 92, clicks: { low_speed_rebound: 6 } }],
      changes: [
        { field: "air_pressure_psi", from: 85, to: 92 },
        { field: "clicks.low_speed_rebound", from: null, to: 6 },
      ],
    });
    const beyond = await callTool(token, "update_setup", {
      setup_id: current.setup.id,
      fork: { clicks: { low_speed_rebound: 30 } },
      dry_run: false,
    });
    expect(beyond.structuredContent.errors).toEqual([
      { field: "fork.clicks.low_speed_rebound", message: "Au plus 18 clics." },
    ]);

    const deleted = await write(token, "delete_setup", { setup_id: current.setup.id });
    expect(deleted.warnings[0]).toMatch(new RegExp(old.setup.set_on));
    expect(listSetups(ctx, bikeId).map((s) => s.id)).toEqual([old.setup.id]);
  });
});

describe("workspace boundary (D-98 tools)", () => {
  it("a token of workspace A reads and changes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const { procedureId, bikeId } = await bleedDue(b.token, b.ctx);
    const run = await write(b.token, "start_run", { procedure_id: procedureId, bike_id: bikeId });
    const event = await write(b.token, "record_maintenance", {
      bike_id: bikeId,
      title: "Bob",
      lines: [{ action: "cleaned" }],
    });
    const calls: [string, Record<string, unknown>, string][] = [
      ["start_run", { procedure_id: procedureId, bike_id: bikeId, dry_run: false }, "procedure_id"],
      ["get_run", { run_id: run.run.id }, "run_id"],
      [
        "update_run_steps",
        { run_id: run.run.id, steps: [{ step_id: 1, done: true }], dry_run: false },
        "run_id",
      ],
      ["finish_run", { run_id: run.run.id, dry_run: false }, "run_id"],
      ["abandon_run", { run_id: run.run.id, dry_run: false }, "run_id"],
      ["delete_maintenance", { event_id: event.event.id, dry_run: false }, "event_id"],
    ];
    for (const [tool, args, field] of calls) {
      const answer = await callTool(a.token, tool, args);
      expect(answer.isError, tool).toBe(true);
      expect(answer.structuredContent.errors[0].field, tool).toBe(field);
    }
    expect(listRunsInProgress(b.ctx)).toHaveLength(1);
    expect(listMaintenanceEvents(b.ctx, bikeId)).toHaveLength(1);
  });
});
