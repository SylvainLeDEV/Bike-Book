import "server-only";
import { z } from "zod";
import {
  COMPONENT_TYPE_CODES,
  PROCEDURE_DIFFICULTIES,
  PROCEDURE_RESOURCE_KINDS,
} from "@/lib/enums";
import { PROCEDURE_DIFFICULTY_LABELS } from "@/lib/labels";
import { nameKey } from "@/lib/names";
import {
  procedureMatches,
  procedureNeeds,
  procedureRow,
  procedureServes,
  readinessOf,
  type ProcedureNeed,
} from "@/lib/procedures";
import type { BikeRef, ProcedureVM } from "@/lib/view-models";
import { parseProcedureInput, procedureInputSchema } from "@/server/actions/procedure-input";
import {
  atomically,
  createProcedure,
  getBike,
  listBikes,
  listInventory,
  listOpenTasks,
  listProcedures,
  previewWrite,
  setProcedureArchived,
  updateProcedure,
  type AccessContext,
  type Procedure,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { procedureVMs } from "@/server/views/procedures";
import { bikeRef } from "@/server/views/refs";
import { loadGarage, type Garage } from "@/server/views/workshop";
import type { Ids } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsOf,
  logWrite,
  pageInput,
  paginate,
  refused,
  ToolRefusal,
  type FieldError,
} from "../tool";

// Maintenance procedures ("fiches", D-86) through the MCP (D-92), read-only: the list with each
// one's material read against the workshop for a bike, and one procedure in full. The material's
// availability is the app's own (procedureNeeds): nothing is decided here.

export function procedureUrl(procedureId: number): string {
  return `${getEnv().publicUrl}/workshop?tab=procedures&procedure=${procedureId}`;
}

type Workspace = { garage: Garage; procedures: ProcedureVM[]; bikes: BikeRef[] };

export function loadProcedures(ctx: AccessContext): Workspace {
  const garage = loadGarage(ctx);
  return {
    garage,
    procedures: procedureVMs(
      garage.procedures,
      garage.bikes,
      garage.rules,
      listOpenTasks(ctx),
      garage.runs,
    ),
    bikes: garage.ridable.map(bikeRef),
  };
}

/** The bike a procedure's material is read for: the one asked if it serves it, else its first. */
export function bikeFor(
  procedure: ProcedureVM,
  bikes: BikeRef[],
  bikeId: number | null,
): BikeRef | null {
  if (bikeId != null && procedureServes(procedure, bikeId)) {
    return bikes.find((bike) => bike.id === bikeId) ?? null;
  }
  return (procedure.bikes === "all" ? bikes : procedure.bikes)[0] ?? null;
}

/** One line of material: ok, low or missing, with the workshop's words. */
export function describeNeed(need: ProcedureNeed) {
  return {
    name: need.name,
    /** tool, part, product, or other (a label not in the workshop). */
    kind: need.group,
    quantity: need.quantity,
    availability: need.availability,
    /** "Possédé", "2 paires en stock", "Stock bas · presque vide", "Manquant", "Pas dans l'atelier". */
    text: need.text,
    item_id: need.item?.id ?? null,
    rebuy_state: need.item?.state ?? null,
  };
}

/** What a procedure needs for a bike, line by line, and its one badge. */
export function materialFor(workspace: Workspace, procedure: ProcedureVM, bikeId: number | null) {
  const needs = procedureNeeds(procedure.lines, workspace.garage.items, bikeId);
  const readiness = readinessOf(needs);
  return {
    material: needs.map(describeNeed),
    readiness: readiness
      ? { missing: readiness.missing, low: readiness.low, label: readiness.label }
      : null,
  };
}

const bikesOf = (procedure: ProcedureVM) =>
  procedure.bikes === "all"
    ? ("all" as const)
    : procedure.bikes.map((bike) => ({ id: bike.id, name: bike.name }));

// --- list_procedures -----------------------------------------------------------------------------

const listProceduresTool = defineTool({
  name: "list_procedures",
  title: "Fiches d'entretien",
  kind: "read",
  description:
    'The maintenance procedures ("fiches"): title, part type, the bikes it is for ("all" or a list), steps, estimated duration (seconds), difficulty (easy, medium, hard), and readiness: its material read against the workshop for a bike (the bike_id given when the procedure is for it, else its first bike): missing and low counts and the app\'s badge ("2 manquants", "Stock bas", "Matériel prêt"; null without material). Filters: bike_id (only the procedures for that bike), query (title, description, steps and material, ignoring case and accents), include_archived. get_procedure gives one in full.',
  input: z.strictObject({
    bike_id: z.number().optional().describe("Only the procedures for this bike (list_bikes)."),
    query: z.string().optional(),
    include_archived: z.boolean().optional().describe("Default false."),
    ...pageInput,
  }),
  run: (ctx, { bike_id: bikeId, query, include_archived: archived, ...page }) => {
    if (bikeId != null && !getBike(ctx, bikeId)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const workspace = loadProcedures(ctx);
    const items = workspace.garage.items;
    const procedures = workspace.procedures
      .filter(
        (procedure) =>
          (archived || !procedure.archived) &&
          (bikeId == null || procedureServes(procedure, bikeId)) &&
          (!query || procedureMatches(procedure, query, items)),
      )
      .sort((a, b) => nameKey(a.title).localeCompare(nameKey(b.title), "fr"));
    const { items: slice, next_cursor } = paginate(procedures, (p) => String(p.id), page);
    return answer(`${slice.length} of ${procedures.length} procedures.`, {
      procedures: slice.map((procedure) => {
        const row = procedureRow(procedure, items, bikeId ?? null, workspace.bikes);
        const forBike = bikeFor(procedure, workspace.bikes, bikeId ?? null);
        return {
          id: procedure.id,
          title: procedure.title,
          component_type_code: procedure.componentTypeCode,
          type_label: procedure.typeLabel,
          bikes: bikesOf(procedure),
          step_count: row.stepCount,
          estimated_duration_s: procedure.estimatedDurationS,
          difficulty: procedure.difficulty,
          archived: procedure.archived,
          readiness: row.readiness,
          readiness_for_bike: forBike ? { id: forBike.id, name: forBike.name } : null,
          url: procedureUrl(procedure.id),
        };
      }),
      next_cursor,
    });
  },
});

/** A procedure in full, its material read for `forBike`; ids left out of a dry run's answer. */
export function describeProcedure(
  workspace: Workspace,
  procedure: ProcedureVM,
  forBike: BikeRef | null,
  ids: Ids,
) {
  const real = ids === "real";
  return {
    id: real ? procedure.id : null,
    title: procedure.title,
    description: procedure.description,
    component_type_code: procedure.componentTypeCode,
    type_label: procedure.typeLabel,
    model_hint: procedure.modelHint,
    bikes: bikesOf(procedure),
    estimated_duration_s: procedure.estimatedDurationS,
    difficulty: procedure.difficulty,
    difficulty_label: procedure.difficulty
      ? PROCEDURE_DIFFICULTY_LABELS[procedure.difficulty]
      : null,
    archived: procedure.archived,
    steps: procedure.steps.map((step, index) => ({
      /** Pass it back to update_procedure to keep the step and its photos. */
      id: real ? step.id : null,
      number: index + 1,
      instruction: step.instruction,
      note: step.note,
      torque_nm: step.torqueNm,
      photo_count: "photoCount" in step ? step.photoCount : 0,
    })),
    /** The material as written: a workshop item, a part type for the bike, or a label. */
    material_lines: procedure.lines.map((line) => ({
      item_id: line.target === "item" ? line.itemId : null,
      component_type_code: line.target === "type" ? line.componentTypeCode : null,
      label: line.target === "label" ? line.label : null,
      quantity: line.quantity,
    })),
    material_for_bike: forBike ? { id: forBike.id, name: forBike.name } : null,
    ...materialFor(workspace, procedure, forBike?.id ?? null),
    resources: procedure.resources.map((resource) => ({
      kind: resource.kind,
      title: resource.title,
      url: resource.url,
      duration_s: resource.durationS,
      body: resource.body,
    })),
    used_by: procedure.links.map((link) => ({
      kind: link.kind,
      id: link.id,
      title: link.title,
      bike: link.bike ? { id: link.bike.id, name: link.bike.name } : null,
      status: link.status,
    })),
    url: real ? procedureUrl(procedure.id) : null,
  };
}

// --- get_procedure -------------------------------------------------------------------------------

const getProcedureTool = defineTool({
  name: "get_procedure",
  title: "Une fiche d'entretien",
  kind: "read",
  description:
    "One maintenance procedure in full: description, model it was written for, steps in order (instruction, note, torque in newton-metres, photo count), material read against the workshop for a bike (each line: availability ok, low or missing, the app's French text, the workshop item), resources (videos, links, notes), and the rules and open tasks that point to it. bike_id: the bike to read the material for (default: the procedure's first bike). Answer the owner with what they have and what is missing before they start.",
  input: z.strictObject({
    procedure_id: z.number().describe("The procedure (list_procedures)."),
    bike_id: z.number().optional().describe("The bike to read the material for (list_bikes)."),
  }),
  run: (ctx, { procedure_id: procedureId, bike_id: bikeId }) => {
    if (bikeId != null && !getBike(ctx, bikeId)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const workspace = loadProcedures(ctx);
    const procedure = workspace.procedures.find((p) => p.id === procedureId);
    if (!procedure) {
      return refused(
        [{ field: "procedure_id", message: "Fiche introuvable." }],
        "Unknown procedure.",
      );
    }
    const forBike = bikeFor(procedure, workspace.bikes, bikeId ?? null);
    const warnings =
      bikeId != null && !procedureServes(procedure, bikeId)
        ? [
            `This procedure is not for bike ${bikeId}: its material is read for ${forBike ? forBike.name : "no bike"}.`,
          ]
        : [];
    return answer(`Procedure "${procedure.title}", ${procedure.steps.length} steps.`, {
      procedure: describeProcedure(workspace, procedure, forBike, "real"),
      warnings,
    });
  },
});

// --- Writing procedures (D-96) -------------------------------------------------------------------

const REFUSED = "The procedure was refused; nothing was written.";

const stepInput = z.strictObject({
  id: z
    .number()
    .optional()
    .describe("update_procedure: an existing step's id (get_procedure) keeps it and its photos."),
  instruction: z.string().describe('In French, one action: "Desserrer la vis de purge".'),
  note: z.string().nullable().optional(),
  torque_nm: z.number().nullable().optional().describe("Tightening torque, newton-metres."),
});

const materialInput = z
  .strictObject({
    item_id: z.number().optional().describe("A workshop item (list_workshop_items)."),
    component_type_code: z
      .enum(COMPONENT_TYPE_CODES)
      .optional()
      .describe("A part type: the workshop's part of that type serving the bike."),
    label: z.string().optional().describe('Anything else, by name: "Seringue".'),
    quantity: z.number().nullable().optional().describe("Units per job (parts)."),
  })
  .describe("Exactly one of item_id, component_type_code or label.");

const resourceInput = z.strictObject({
  kind: z.enum(PROCEDURE_RESOURCE_KINDS).describe("video, link (https pages) or note (text)."),
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  duration_s: z.number().nullable().optional().describe("video: its length, seconds."),
  body: z.string().nullable().optional().describe("note: its text."),
});

const procedureFields = {
  title: z.string().describe('In French: "Purge des freins Shimano".'),
  description: z.string().nullable().optional(),
  component_type_code: z
    .enum(COMPONENT_TYPE_CODES)
    .nullable()
    .optional()
    .describe("The part type it is about (list_component_types), or null."),
  model_hint: z
    .string()
    .nullable()
    .optional()
    .describe('The model it was written for: "Shimano XT M8120".'),
  bike_ids: z
    .union([z.literal("all"), z.array(z.number())])
    .optional()
    .describe('"all" (default) or the bikes it is for.'),
  estimated_duration_s: z
    .number()
    .nullable()
    .optional()
    .describe("Seconds, rounded to the minute (45 min → 2700)."),
  difficulty: z.enum(PROCEDURE_DIFFICULTIES).nullable().optional(),
  steps: z.array(stepInput).optional().describe("In order, up to 60."),
  material: z.array(materialInput).optional().describe("What it takes, up to 60 lines."),
  resources: z.array(resourceInput).optional().describe("Videos, links, notes; up to 30."),
};

type ProcedureArgs = Partial<{
  [K in keyof typeof procedureFields]: z.output<(typeof procedureFields)[K]>;
}>;

const RENAME = {
  lines: "material",
  durationMin: "estimated_duration_s",
  bikes: "bike_ids",
  itemId: "item_id",
};

/** The editor's input, as the procedure is now (`current` null: a new one). */
function editorInput(current: Procedure | null) {
  return {
    title: current?.title ?? "",
    description: current?.description ?? null,
    componentTypeCode: current?.componentTypeCode ?? null,
    modelHint: current?.modelHint ?? null,
    bikes: !current || current.allBikes ? ("all" as const) : current.bikeIds,
    durationMin:
      current?.estimatedDurationS == null ? null : Math.round(current.estimatedDurationS / 60),
    difficulty: current?.difficulty ?? null,
    steps: (current?.steps ?? []).map((step) => ({
      id: step.id as number | null,
      instruction: step.instruction,
      note: step.note,
      torqueNm: step.torqueNm,
    })),
    lines: (current?.items ?? []).map((item) =>
      item.inventoryItemId != null
        ? { target: "item" as const, itemId: item.inventoryItemId, quantity: item.quantity }
        : item.componentTypeCode != null
          ? {
              target: "type" as const,
              componentTypeCode: item.componentTypeCode,
              quantity: item.quantity,
            }
          : { target: "label" as const, label: item.label ?? "", quantity: item.quantity },
    ),
    resources: (current?.resources ?? []).map(({ kind, url, title, durationS, body }) => ({
      kind,
      url,
      title,
      durationS,
      body,
    })),
  };
}

/** The fields given over the procedure's own; refusals name the tool's fields. */
function procedureInput(
  ctx: AccessContext,
  current: Procedure | null,
  args: ProcedureArgs,
): { data: ReturnType<typeof parseProcedureInput> & { ok: true } } | { errors: FieldError[] } {
  const base = editorInput(current);
  const errors: FieldError[] = [];
  const pick = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
  const items = new Set(listInventory(ctx).map((item) => item.id));
  const bikes = new Set(listBikes(ctx).map((bike) => bike.id));
  const stepIds = new Set((current?.steps ?? []).map((step) => step.id));
  args.steps?.forEach((step, index) => {
    if (step.id != null && !stepIds.has(step.id)) {
      errors.push({ field: `steps[${index}].id`, message: "Étape introuvable sur cette fiche." });
    }
  });
  args.material?.forEach((line, index) => {
    const targets = [line.item_id, line.component_type_code, line.label].filter(
      (value) => value != null,
    ).length;
    if (targets !== 1) {
      errors.push({
        field: `material[${index}]`,
        message: "Une ligne : un objet de l'atelier, un type de pièce ou un libellé.",
      });
    } else if (line.item_id != null && !items.has(line.item_id)) {
      errors.push({
        field: `material[${index}].item_id`,
        message: "Objet de l'atelier introuvable.",
      });
    }
  });
  if (Array.isArray(args.bike_ids)) {
    args.bike_ids.forEach((id, index) => {
      if (!bikes.has(id))
        errors.push({ field: `bike_ids[${index}]`, message: "Vélo introuvable." });
    });
  }
  if (errors.length) return { errors };

  const input = {
    title: args.title ?? base.title,
    description: pick(args.description, base.description),
    componentTypeCode: pick(args.component_type_code, base.componentTypeCode),
    modelHint: pick(args.model_hint, base.modelHint),
    bikes: args.bike_ids ?? base.bikes,
    durationMin:
      args.estimated_duration_s === undefined
        ? base.durationMin
        : args.estimated_duration_s == null
          ? null
          : Math.round(args.estimated_duration_s / 60),
    difficulty: pick(args.difficulty, base.difficulty),
    steps: args.steps
      ? args.steps.map((step) => ({
          id: step.id ?? null,
          instruction: step.instruction,
          note: step.note ?? null,
          torqueNm: step.torque_nm ?? null,
        }))
      : base.steps,
    lines: args.material
      ? args.material.map((line) =>
          line.item_id != null
            ? { target: "item" as const, itemId: line.item_id, quantity: line.quantity ?? null }
            : line.component_type_code != null
              ? {
                  target: "type" as const,
                  componentTypeCode: line.component_type_code,
                  quantity: line.quantity ?? null,
                }
              : {
                  target: "label" as const,
                  label: line.label ?? "",
                  quantity: line.quantity ?? null,
                },
        )
      : base.lines,
    resources: args.resources
      ? args.resources.map((resource) => ({
          kind: resource.kind,
          url: resource.url ?? null,
          title: resource.title ?? null,
          durationS: resource.duration_s ?? null,
          body: resource.body ?? null,
        }))
      : base.resources,
  };
  const checked = procedureInputSchema.safeParse(input);
  if (!checked.success) return { errors: fieldErrorsOf(checked.error.issues, "", RENAME) };
  const data = parseProcedureInput(input);
  if (!data.ok) return { errors: [{ field: "input", message: data.error }] };
  return { data };
}

/** The procedure after a write, read inside its transaction, as get_procedure answers it. */
function described(ctx: AccessContext, procedureId: number, ids: Ids) {
  const workspace = loadProcedures(ctx);
  const procedure = workspace.procedures.find((p) => p.id === procedureId)!;
  return describeProcedure(workspace, procedure, bikeFor(procedure, workspace.bikes, null), ids);
}

const createProcedureTool = defineTool({
  name: "create_procedure",
  title: "Nouvelle fiche",
  kind: "write",
  description:
    'Writes a maintenance procedure ("fiche"), as "Nouvelle fiche": title, part type, the model it was written for, the bikes it is for, duration, difficulty (easy, medium, hard), steps in order (instruction, note, torque in newton-metres), material (each line a workshop item, a part type, or a label for what is not in the workshop: it then reads as missing), resources (videos, links, notes). Write steps from the manufacturer\'s documents and give their source as a link resource; never invent a torque. The answer reads its material against the workshop. Call with dry_run true first.',
  input: z.strictObject({ ...procedureFields, dry_run: dryRunInput }),
  run: (ctx, { dry_run: dryRun, ...args }) => {
    if (args.steps?.some((step) => step.id != null)) {
      return refused(
        [{ field: "steps", message: "Une nouvelle fiche n'a pas encore d'étapes à garder." }],
        REFUSED,
      );
    }
    const result = procedureInput(ctx, null, args);
    if ("errors" in result) return refused(result.errors, REFUSED);
    const data = result.data.data;
    const key = nameKey(data.title);
    const namesakes = listProcedures(ctx).filter((p) => nameKey(p.title) === key);
    const ids: Ids = dryRun ? "none" : "real";
    const write = () => {
      const outcome = createProcedure(ctx, data);
      if (!outcome.ok) {
        throw new ToolRefusal(
          [{ field: "input", message: "Vélo ou objet de l'atelier introuvable." }],
          REFUSED,
        );
      }
      return {
        procedureId: outcome.procedureId,
        procedure: described(ctx, outcome.procedureId, ids),
      };
    };
    const written = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "create_procedure", { procedure_id: written.procedureId });
    return answer(
      dryRun
        ? `Dry run: would write the procedure "${data.title}" (${data.steps.length} steps). Nothing was written.`
        : `Wrote the procedure "${data.title}" (procedure ${written.procedureId}).`,
      {
        dry_run: dryRun,
        procedure: written.procedure,
        warnings: namesakes.map(
          (p) =>
            `A procedure named "${p.title}" already exists (id ${p.id}${p.archivedAt != null ? ", archived" : ""}): update_procedure changes it.`,
        ),
      },
    );
  },
});

const updateProcedureTool = defineTool({
  name: "update_procedure",
  title: "Modifier une fiche",
  kind: "write",
  description:
    'Changes a procedure, as "Modifier la fiche": only the fields given change. steps, material and resources, when given, replace the whole list: pass back each step to keep with its id (get_procedure), or its photos go with it; a step without id is new. The answer warns about steps removed with their photos. Call with dry_run true first; a dry run that would remove photos only describes the change.',
  input: z.strictObject({
    procedure_id: z.number().describe("The procedure (list_procedures)."),
    ...(Object.fromEntries(
      Object.entries(procedureFields).map(([key, schema]) => [key, schema.optional()]),
    ) as { [K in keyof typeof procedureFields]: z.ZodOptional<(typeof procedureFields)[K]> }),
    dry_run: dryRunInput,
  }),
  run: (ctx, { procedure_id: procedureId, dry_run: dryRun, ...args }) => {
    const current = listProcedures(ctx).find((p) => p.id === procedureId);
    if (!current) {
      return refused(
        [{ field: "procedure_id", message: "Fiche introuvable." }],
        "Unknown procedure.",
      );
    }
    const result = procedureInput(ctx, current, args as ProcedureArgs);
    if ("errors" in result) return refused(result.errors, REFUSED);
    const data = result.data.data;
    const kept = new Set(data.steps.flatMap((step) => (step.id == null ? [] : [step.id])));
    const removed = current.steps.filter((step) => !kept.has(step.id));
    const photosLost = removed.filter((step) => step.photoCount > 0);
    const warnings = photosLost.map(
      (step) =>
        `The step "${step.instruction}" is removed with its ${step.photoCount} photo(s): pass its id to keep it.`,
    );
    // Removing a step deletes its photos' files once the write is done (D-76): such a dry run
    // never runs the write, it describes it.
    if (dryRun && photosLost.length) {
      return answer(
        `Dry run: would change the procedure "${data.title}" (${data.steps.length} steps, ${removed.length} removed). Nothing was written.`,
        {
          dry_run: true,
          procedure: {
            id: procedureId,
            title: data.title,
            steps: data.steps.map((step, index) => ({
              id: step.id,
              number: index + 1,
              instruction: step.instruction,
              note: step.note,
              torque_nm: step.torqueNm,
            })),
          },
          removed_steps: removed.map((step) => ({ id: step.id, instruction: step.instruction })),
          warnings,
        },
      );
    }
    const write = () => {
      if (!updateProcedure(ctx, procedureId, data).ok) {
        throw new ToolRefusal(
          [{ field: "input", message: "Vélo ou objet de l'atelier introuvable." }],
          REFUSED,
        );
      }
      return described(ctx, procedureId, "real");
    };
    const procedure = dryRun ? previewWrite(write) : write();
    if (!dryRun) logWrite(ctx, "update_procedure", { procedure_id: procedureId });
    return answer(
      dryRun
        ? `Dry run: would change the procedure "${data.title}". Nothing was written.`
        : `Changed the procedure "${data.title}".`,
      {
        dry_run: dryRun,
        procedure,
        removed_steps: removed.map((step) => ({ id: step.id, instruction: step.instruction })),
        warnings,
      },
    );
  },
});

const archiveProcedureTool = defineTool({
  name: "archive_procedure",
  title: "Archiver une fiche",
  kind: "write",
  description:
    'Archives a procedure, as "Archiver la fiche": it leaves the lists, the rules and tasks that point to it keep it; archived false brings it back. Deleting a procedure stays in the app. Call with dry_run true first.',
  input: z.strictObject({
    procedure_id: z.number().describe("The procedure (list_procedures)."),
    archived: z.boolean().optional().describe("true (default): archive; false: bring it back."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { procedure_id: procedureId, archived = true, dry_run: dryRun }) => {
    const procedure = listProcedures(ctx).find((p) => p.id === procedureId);
    if (!procedure) {
      return refused(
        [{ field: "procedure_id", message: "Fiche introuvable." }],
        "Unknown procedure.",
      );
    }
    const changed = (procedure.archivedAt != null) !== archived;
    if (changed && !dryRun) {
      atomically(() => {
        if (!setProcedureArchived(ctx, procedureId, archived ? Date.now() : null).ok) {
          throw new ToolRefusal([{ field: "procedure_id", message: "Fiche introuvable." }]);
        }
      });
      logWrite(ctx, "archive_procedure", { procedure_id: procedureId });
    }
    const what = archived ? "archived" : "back in the list";
    return answer(
      !changed
        ? `Nothing to change: "${procedure.title}" is already ${what}.`
        : dryRun
          ? `Dry run: "${procedure.title}" would be ${what}. Nothing was written.`
          : `"${procedure.title}" is ${what}.`,
      {
        dry_run: dryRun,
        changed,
        procedure: { id: procedure.id, title: procedure.title, archived },
        warnings: [],
      },
    );
  },
});

export const procedureTools = [
  listProceduresTool,
  getProcedureTool,
  createProcedureTool,
  updateProcedureTool,
  archiveProcedureTool,
];
