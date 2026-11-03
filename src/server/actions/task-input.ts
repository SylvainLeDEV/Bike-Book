import "server-only";
import { z } from "zod";
import { isLocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { TaskInput } from "@/lib/view-models";

// Validation of "Nouvelle tâche" and "Modifier la tâche" (D-34), shared with the MCP's add_task
// (D-92).

export const taskSchema = z.object({
  bikeId: z.number().int().positive().nullable(),
  title: z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(1, "Donne un titre à la tâche.").max(120, "120 caractères au maximum.")),
  dueOn: z.string().refine(isLocalDate, "Date invalide.").nullable(),
  notes: z
    .string()
    .trim()
    .max(2000, "2000 caractères au maximum.")
    .nullable()
    .transform((value) => value || null),
  /** The procedure it is done with (D-86); checked against the workspace when saved. */
  procedureId: z.number().int().positive().nullable().optional(),
}) satisfies z.ZodType<TaskInput, unknown>;
