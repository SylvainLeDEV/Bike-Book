import "server-only";
import { z } from "zod";
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
import { getBike, listOpenTasks, type AccessContext } from "@/server/db";
import { getEnv } from "@/server/env";
import { procedureVMs } from "@/server/views/procedures";
import { bikeRef } from "@/server/views/refs";
import { loadGarage, type Garage } from "@/server/views/workshop";
import { answer, defineTool, pageInput, paginate, refused } from "../tool";

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
function bikeFor(procedure: ProcedureVM, bikes: BikeRef[], bikeId: number | null): BikeRef | null {
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
      procedure: {
        id: procedure.id,
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
          number: index + 1,
          instruction: step.instruction,
          note: step.note,
          torque_nm: step.torqueNm,
          photo_count: "photoCount" in step ? step.photoCount : 0,
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
        url: procedureUrl(procedure.id),
      },
      warnings,
    });
  },
});

export const procedureTools = [listProceduresTool, getProcedureTool];
