import "server-only";
import { z } from "zod";
import { formatItemStock } from "@/lib/display";
import { isLocalDate } from "@/lib/format";
import type { RuleRowVM, TaskRowVM } from "@/lib/view-models";
import { taskSchema } from "@/server/actions/task-input";
import {
  atomically,
  createTask,
  getBike,
  listDoneTasks,
  listOpenTasks,
  listProcedures,
  previewWrite,
  setTaskStatus,
  updateTask,
} from "@/server/db";
import { byUrgency } from "@/server/domain/rules";
import { eventInstant } from "@/server/domain/time";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { taskRow } from "@/server/views/refs";
import { runRows } from "@/server/views/runs";
import { rebuyRows } from "@/server/views/workshop";
import { bikeUrl, type Ids } from "../describe";
import { answer, defineTool, dryRunInput, fieldErrorsOf, logWrite, refused } from "../tool";
import { loadProcedures, materialFor } from "./procedures";

// What is to do (D-92): "À prévoir" of the dashboard (feature 9) through the MCP, each rule and
// task with its procedure's material read against the workshop, so the assistant can say what
// to do and whether the owner has what it takes; and "Nouvelle tâche" (D-34).

const bikeOf = (bike: { id: number; name: string } | null) =>
  bike ? { id: bike.id, name: bike.name } : null;

// --- list_due_work -------------------------------------------------------------------------------

const listDueWorkTool = defineTool({
  name: "list_due_work",
  title: "À prévoir",
  kind: "read",
  description:
    "What is to do, as the app's \"À prévoir\": the maintenance rules overdue or due soon on the bikes in use (most urgent first), with the usage since last done against the interval (unit distance_m, duration_s or days), the day it falls due, an estimate in days (eta_days, from the last 8 weeks of riding), the workshop part or product of that slot (stock_text in French) and the procedure it is done with, its material read against the workshop for that bike (availability ok, low or missing); the open tasks (by due day, with their procedure's material); the runs in progress; and how many workshop items are to rebuy (list_workshop_items with to_rebuy). bike_id narrows it to one bike. A summary, not paginated. Answer the owner with what to do first and what they lack.",
  input: z.strictObject({
    bike_id: z.number().optional().describe("Only this bike (list_bikes)."),
    include_due_soon: z
      .boolean()
      .optional()
      .describe("Default true. false: only the overdue rules and the late tasks."),
  }),
  run: (ctx, { bike_id: bikeId, include_due_soon: dueSoon = true }) => {
    if (bikeId != null && !getBike(ctx, bikeId)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const day = today();
    const { timeZone } = getEnv();
    const workspace = loadProcedures(ctx);
    const { garage } = workspace;
    const procedureById = new Map(workspace.procedures.map((p) => [p.id, p]));
    const material = (procedureId: number | null | undefined, forBike: number | null) => {
      const procedure = procedureId == null ? null : procedureById.get(procedureId);
      return procedure
        ? {
            id: procedure.id,
            title: procedure.title,
            ...materialFor(workspace, procedure, forBike),
          }
        : null;
    };

    const wanted = (status: RuleRowVM["status"]) =>
      status === "overdue" || (dueSoon && status === "due_soon");
    const rules = garage.ridable
      .filter((bike) => bikeId == null || bike.id === bikeId)
      .flatMap((bike) => (garage.rules.get(bike.id) ?? []).map((entry) => entry.row))
      .filter((row) => wanted(row.status))
      .sort(byUrgency)
      .map((row) => ({
        rule_id: row.id,
        bike: bikeOf(row.bike),
        title: row.title,
        slot: row.slot ? { type_label: row.slot.typeLabel, model: row.slot.model } : null,
        status: row.status,
        /** 1.13 = 113 % of the interval used. */
        ratio: Math.round(row.ratio * 100) / 100,
        used: row.used,
        interval: row.interval,
        due_on: row.dueOn,
        eta_days: row.etaDays,
        last_done_on: row.lastDoneOn,
        stock: row.stock
          ? {
              item_id: row.stock.itemId,
              name: row.stock.name,
              stock_text: formatItemStock(row.stock),
              rebuy_state: row.stock.state,
            }
          : null,
        procedure: material(row.procedure?.id, row.bike.id),
        run_in_progress: row.run ? { id: row.run.id } : null,
        bike_url: bikeUrl(row.bike.id),
      }));

    const late = (task: TaskRowVM) => task.dueOn != null && task.dueOn < day;
    const tasks = listOpenTasks(ctx, bikeId)
      .map((task) => ({
        task,
        row: taskRow(task, garage.bikes, timeZone, garage.procedures, garage.runs),
      }))
      .filter(({ row }) => dueSoon || late(row))
      .map(({ task, row }) => ({
        task_id: row.id,
        bike: bikeOf(row.bike),
        title: row.title,
        due_on: row.dueOn,
        late: late(row),
        notes: row.notes,
        procedure: material(task.procedureId, task.bikeId),
        run_in_progress: row.run ? { id: row.run.id } : null,
      }));

    const runs = runRows(garage.runs, garage.bikes, timeZone)
      .filter((run) => bikeId == null || run.bike?.id === bikeId)
      .map((run) => ({
        run_id: run.id,
        title: run.title,
        bike: bikeOf(run.bike),
        step_count: run.stepCount,
        done_count: run.doneCount,
        started_on: run.startedOn,
        url: `${getEnv().publicUrl}/runs/${run.id}`,
      }));

    const overdue = rules.filter((rule) => rule.status === "overdue").length;
    return answer(
      `${overdue} overdue and ${rules.length - overdue} due-soon rules, ${tasks.length} open tasks, ${runs.length} runs in progress.`,
      {
        today: day,
        rules,
        tasks,
        runs,
        to_rebuy_count: rebuyRows(garage.items).length,
      },
    );
  },
});

// --- add_task ------------------------------------------------------------------------------------

const RENAME = { bikeId: "bike_id", dueOn: "due_on", procedureId: "procedure_id" };

const addTaskTool = defineTool({
  name: "add_task",
  title: "Ajouter une tâche",
  kind: "write",
  description:
    'Adds a one-off task, as "Nouvelle tâche": something to do once (not a recurring service: add_rule), on a bike or general (bike_id omitted), with an optional due day and the procedure it is done with. Call with dry_run true first.',
  input: z.strictObject({
    bike_id: z.number().nullable().optional().describe("The bike (list_bikes); omitted: general."),
    title: z.string().describe('In French: "Changer la chaîne", "Régler le dérailleur".'),
    due_on: z.string().nullable().optional().describe("Day it is due, YYYY-MM-DD."),
    notes: z.string().nullable().optional(),
    procedure_id: z
      .number()
      .nullable()
      .optional()
      .describe("The procedure it is done with (list_procedures)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { dry_run: dryRun, ...args }) => {
    const parsed = taskSchema.safeParse({
      bikeId: args.bike_id ?? null,
      title: args.title,
      dueOn: args.due_on ?? null,
      notes: args.notes ?? null,
      procedureId: args.procedure_id ?? null,
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The task was refused; nothing was written.",
      );
    }
    const data = parsed.data;
    const bike = data.bikeId == null ? null : getBike(ctx, data.bikeId);
    if (data.bikeId != null && !bike) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const procedure =
      data.procedureId == null ? null : listProcedures(ctx).find((p) => p.id === data.procedureId);
    if (data.procedureId != null && (!procedure || procedure.archivedAt != null)) {
      return refused(
        [
          {
            field: "procedure_id",
            message: procedure ? "Cette fiche est archivée." : "Fiche introuvable.",
          },
        ],
        "The task was refused; nothing was written.",
      );
    }
    const ids: Ids = dryRun ? "none" : "real";
    const write = () => {
      const outcome = createTask(ctx, data);
      if (!outcome.ok) throw new Error("createTask refused a checked task");
      return outcome.taskId;
    };
    const taskId = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "add_task", { task_id: taskId });
    const task = {
      id: ids === "real" ? taskId : null,
      bike: bike ? { id: bike.id, name: bike.name } : null,
      title: data.title,
      due_on: data.dueOn,
      notes: data.notes,
      procedure: procedure ? { id: procedure.id, title: procedure.title } : null,
    };
    return answer(
      dryRun
        ? `Dry run: would add the task "${data.title}"${bike ? ` on ${bike.name}` : ""}. Nothing was written.`
        : `Added the task "${data.title}" (task ${taskId}).`,
      {
        dry_run: dryRun,
        task,
        warnings:
          data.dueOn != null && data.dueOn < today() ? ["The due day is already past."] : [],
        url: bike ? bikeUrl(bike.id) : `${getEnv().publicUrl}/`,
      },
    );
  },
});

// --- set_task_done -------------------------------------------------------------------------------

const setTaskDoneTool = defineTool({
  name: "set_task_done",
  title: "Tâche faite",
  kind: "write",
  description:
    'Marks a task done, as its "Fait" button (done_on: the day, default today), or open again (done false, "Rouvrir la tâche"). It only changes the task: work on the bike (a service, a part changed) is recorded with record_maintenance or replace_component, so the rules restart and the bike\'s history keeps it. Call with dry_run true first.',
  input: z.strictObject({
    task_id: z.number().describe("The task (list_due_work)."),
    done: z.boolean().optional().describe("true (default): done; false: open again."),
    done_on: z
      .string()
      .optional()
      .describe("Day it was done, YYYY-MM-DD, not in the future (default today)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { task_id: taskId, done = true, done_on: doneOn, dry_run: dryRun }) => {
    const day = today();
    const task =
      listOpenTasks(ctx).find((t) => t.id === taskId) ??
      listDoneTasks(ctx).find((t) => t.id === taskId);
    if (!task)
      return refused([{ field: "task_id", message: "Tâche introuvable." }], "Unknown task.");
    if (doneOn !== undefined && !done) {
      return refused(
        [{ field: "done_on", message: "Seulement pour une tâche faite." }],
        "The task was refused; nothing was written.",
      );
    }
    if (doneOn !== undefined && (!isLocalDate(doneOn) || doneOn > day)) {
      return refused(
        [
          {
            field: "done_on",
            message: isLocalDate(doneOn)
              ? "La date ne peut pas être dans le futur."
              : "Date invalide.",
          },
        ],
        "The task was refused; nothing was written.",
      );
    }
    if ((task.status === "done") === done) {
      return answer(`Nothing to change: the task is already ${done ? "done" : "open"}.`, {
        dry_run: dryRun,
        changed: false,
        task: { id: task.id, title: task.title, status: task.status },
        warnings: [],
      });
    }
    const write = () => {
      const now = Date.now();
      const at = done ? eventInstant(doneOn ?? day, now, getEnv().timeZone) : now;
      if (!setTaskStatus(ctx, taskId, done ? "done" : "open", at).ok) {
        throw new Error("setTaskStatus refused a task of the workspace");
      }
    };
    if (dryRun) previewWrite(write);
    else {
      atomically(write);
      logWrite(ctx, "set_task_done", { task_id: taskId });
    }
    const verb = done ? "done" : "open again";
    return answer(
      dryRun
        ? `Dry run: the task "${task.title}" would be ${verb}. Nothing was written.`
        : `The task "${task.title}" is ${verb}.`,
      {
        dry_run: dryRun,
        changed: true,
        task: {
          id: task.id,
          title: task.title,
          status: done ? "done" : "open",
          done_on: done ? (doneOn ?? day) : null,
        },
        warnings:
          done && task.procedureId != null
            ? [
                "This task has a procedure: if parts or products were used, or a rule fulfilled, record it with record_maintenance or replace_component.",
              ]
            : [],
        url: task.bikeId == null ? `${getEnv().publicUrl}/` : bikeUrl(task.bikeId),
      },
    );
  },
});

// --- update_task ---------------------------------------------------------------------------------

const updateTaskTool = defineTool({
  name: "update_task",
  title: "Modifier une tâche",
  kind: "write",
  description:
    'Changes a task, as "Modifier la tâche": only the fields given change; null clears the bike (a general task), the due day, the notes or the procedure. Call with dry_run true first.',
  input: z.strictObject({
    task_id: z.number().describe("The task (list_due_work)."),
    bike_id: z.number().nullable().optional().describe("Another bike (list_bikes), or null."),
    title: z.string().optional(),
    due_on: z.string().nullable().optional().describe("YYYY-MM-DD, or null."),
    notes: z.string().nullable().optional(),
    procedure_id: z.number().nullable().optional().describe("list_procedures, or null."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { task_id: taskId, dry_run: dryRun, ...args }) => {
    const task =
      listOpenTasks(ctx).find((t) => t.id === taskId) ??
      listDoneTasks(ctx).find((t) => t.id === taskId);
    if (!task)
      return refused([{ field: "task_id", message: "Tâche introuvable." }], "Unknown task.");
    const pick = <T>(value: T | undefined, base: T) => (value === undefined ? base : value);
    const parsed = taskSchema.safeParse({
      bikeId: pick(args.bike_id, task.bikeId),
      title: args.title ?? task.title,
      dueOn: pick(args.due_on, task.dueOn),
      notes: pick(args.notes, task.notes),
      procedureId: pick(args.procedure_id, task.procedureId),
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The task was refused; nothing was written.",
      );
    }
    const data = parsed.data;
    const bike = data.bikeId == null ? null : getBike(ctx, data.bikeId);
    if (data.bikeId != null && !bike) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const procedure =
      data.procedureId == null ? null : listProcedures(ctx).find((p) => p.id === data.procedureId);
    if (
      data.procedureId != null &&
      data.procedureId !== task.procedureId &&
      (!procedure || procedure.archivedAt != null)
    ) {
      return refused(
        [
          {
            field: "procedure_id",
            message: procedure ? "Cette fiche est archivée." : "Fiche introuvable.",
          },
        ],
        "The task was refused; nothing was written.",
      );
    }
    const write = () => {
      if (!updateTask(ctx, taskId, data).ok) {
        throw new Error("updateTask refused a checked task");
      }
    };
    if (dryRun) previewWrite(write);
    else {
      atomically(write);
      logWrite(ctx, "update_task", { task_id: taskId });
    }
    return answer(
      dryRun
        ? `Dry run: would change the task "${data.title}". Nothing was written.`
        : `Changed the task "${data.title}" (task ${taskId}).`,
      {
        dry_run: dryRun,
        task: {
          id: taskId,
          bike: bike ? { id: bike.id, name: bike.name } : null,
          title: data.title,
          due_on: data.dueOn,
          notes: data.notes,
          procedure: procedure ? { id: procedure.id, title: procedure.title } : null,
          status: task.status,
        },
        warnings: [],
        url: bike ? bikeUrl(bike.id) : `${getEnv().publicUrl}/`,
      },
    );
  },
});

export const todoTools = [listDueWorkTool, addTaskTool, updateTaskTool, setTaskDoneTool];
