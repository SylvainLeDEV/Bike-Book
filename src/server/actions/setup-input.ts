import "server-only";
import { z } from "zod";
import { isLocalDate, type LocalDate } from "@/lib/format";
import { suspensionValueErrors } from "@/lib/setup";
import type { SetupFieldErrors, SetupInput, SuspensionSpecsInput } from "@/lib/view-models";

// Validation of the setup sheet (D-79; D-50: clean on the way in). Ranges catch typing mistakes;
// the part's own limits (clicks, travel) are checked against its specs.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => (value ? value : null));

const positive = (max: number, message: string) =>
  z.number({ error: message }).gt(0, message).max(max, message).nullable();

const count = (max: number, message: string) =>
  z.number({ error: message }).int(message).min(0, message).max(max, message).nullable();

const clicks = count(60, "Entre 0 et 60 clics.");

export function setupInputSchema(today: LocalDate) {
  return z.object({
    setOn: z
      .string()
      .refine(isLocalDate, "Date invalide.")
      .refine((value) => value <= today, "La date ne peut pas être dans le futur."),
    label: optionalText(60),
    notes: optionalText(2000),
    tireFrontPressureBar: positive(10, "Pression invalide (bar)."),
    tireRearPressureBar: positive(10, "Pression invalide (bar)."),
    suspensions: z
      .array(
        z.object({
          componentId: z.number().int().positive(),
          airPressurePsi: positive(600, "Pression invalide (psi)."),
          springRateLbPerIn: z
            .number({ error: "Ressort invalide (lb/in)." })
            .int("Ressort invalide (lb/in).")
            .min(1, "Ressort invalide (lb/in).")
            .max(2000, "Ressort invalide (lb/in).")
            .nullable(),
          volumeSpacers: count(20, "Entre 0 et 20 tokens."),
          sagMm: z
            .number({ error: "SAG invalide." })
            .min(0, "SAG invalide.")
            .max(300, "SAG invalide.")
            .nullable(),
          sagTargetPercent: z
            .number({ error: "SAG visé invalide." })
            .gt(0, "SAG visé invalide.")
            .max(100, "SAG visé invalide.")
            .nullable(),
          clicks: z.object({
            low_speed_rebound: clicks,
            high_speed_rebound: clicks,
            low_speed_compression: clicks,
            high_speed_compression: clicks,
          }),
        }),
      )
      .max(2),
  }) satisfies z.ZodType<SetupInput, unknown>;
}

/**
 * The sheet's input, checked: ranges first, then each part's values against its specs. Error keys
 * are the header fields or `<componentId>.<field>`, as the sheet names its fields.
 */
export function parseSetupInput(
  input: unknown,
  today: LocalDate,
  specsOf: (componentId: number) => SuspensionSpecsInput | null,
): { success: true; data: SetupInput } | { success: false; fieldErrors: SetupFieldErrors } {
  const parsed = setupInputSchema(today).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: SetupFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const [first, index, field, adjuster] = issue.path;
      let key = typeof first === "string" ? first : "form";
      if (first === "suspensions" && typeof index === "number") {
        const componentId = (input as { suspensions?: { componentId?: unknown }[] })?.suspensions?.[
          index
        ]?.componentId;
        key = `${String(componentId)}.${String(field === "clicks" ? adjuster : field)}`;
      }
      fieldErrors[key] ??= issue.message;
    }
    return { success: false, fieldErrors };
  }
  const fieldErrors = Object.assign(
    {},
    ...parsed.data.suspensions.map((values) =>
      suspensionValueErrors(values, specsOf(values.componentId)),
    ),
  ) as SetupFieldErrors;
  return Object.keys(fieldErrors).length
    ? { success: false, fieldErrors }
    : { success: true, data: parsed.data };
}
