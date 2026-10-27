import "server-only";
import { z } from "zod";
import { MAINTENANCE_LINE_ACTIONS, MEASUREMENT_UNITS, SHOP_KINDS } from "@/lib/enums";
import { isLocalDate, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { MaintenanceInput } from "@/lib/view-models";

// Validation of the maintenance sheet (D-50, D-63).

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => value || null);
const money = z
  .number({ error: "Montant invalide." })
  .int("Montant invalide.")
  .min(0, "Montant invalide.")
  .max(100_000_000, "Montant invalide.")
  .nullable();

const line = z
  .object({
    action: z.enum(MAINTENANCE_LINE_ACTIONS),
    componentId: z.number().int().positive().nullable(),
    ruleId: z.number().int().positive().nullable(),
    description: text(200),
    costCents: money,
    measurementValue: z
      .number({ error: "Mesure invalide." })
      .min(0, "Mesure invalide.")
      .max(1000, "Mesure invalide.")
      .nullable(),
    measurementUnit: z.enum(MEASUREMENT_UNITS).nullable(),
  })
  .refine((l) => (l.measurementValue == null) === (l.measurementUnit == null), {
    error: "Indique la mesure et son unité.",
    path: ["measurementValue"],
  });

export function maintenanceSchema(today: LocalDate) {
  return z.object({
    bikeId: z.number().int().positive(),
    on: z
      .string()
      .refine(isLocalDate, "Date invalide.")
      .refine((date) => date <= today, "La date ne peut pas être dans le futur."),
    title: z
      .string()
      .transform(cleanName)
      .pipe(
        z.string().min(1, "Donne un titre à l'entretien.").max(120, "120 caractères au maximum."),
      ),
    performedBy: z.enum(["self", "shop"]),
    shop: z
      .object({
        name: z
          .string()
          .transform(cleanName)
          .pipe(z.string().min(1).max(100, "100 caractères au maximum.")),
        kind: z.enum(SHOP_KINDS),
      })
      .nullable(),
    totalCostCents: money,
    notes: text(2000),
    lines: z.array(line).max(20, "20 interventions au maximum."),
  }) satisfies z.ZodType<MaintenanceInput, unknown>;
}
