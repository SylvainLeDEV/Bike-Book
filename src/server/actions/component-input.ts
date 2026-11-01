import "server-only";
import { z } from "zod";
import { COMPONENT_POSITIONS, COMPONENT_TYPE_CODES, SHOP_KINDS, SPRING_TYPES } from "@/lib/enums";
import { isLocalDate, startOfLocalDay, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import { isSuspensionType } from "@/lib/setup";
import type { ComponentInput, ReplacePartInput } from "@/lib/view-models";
import type { ComponentData } from "@/server/db";
import { eventInstant } from "@/server/domain/time";

// Validation of the component and replace sheets (D-50: clean on the way in).

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => (value ? value : null));

const integerIn = (min: number, max: number, message: string) =>
  z.number({ error: message }).int(message).min(min, message).max(max, message);

const date = z.string().refine(isLocalDate, "Date invalide.");
const pastDate = (today: LocalDate, message: string) =>
  date.refine((value) => value <= today, message);
const money = integerIn(0, 100_000_000, "Montant invalide.").nullable();

const maxClicks = integerIn(1, 60, "Entre 1 et 60 clics.").nullable();

/** A fork's or rear shock's suspension specs (D-79). */
export const suspensionSpecsSchema = z.object({
  springType: z.enum(SPRING_TYPES, { error: "Choisis air ou ressort." }),
  travelMm: z
    .number({ error: "Débattement invalide." })
    .gt(0, "Débattement invalide.")
    .max(300, "300 mm au maximum.")
    .nullable(),
  maxClicks: z.object({
    low_speed_rebound: maxClicks,
    high_speed_rebound: maxClicks,
    low_speed_compression: maxClicks,
    high_speed_compression: maxClicks,
  }),
});

export function componentInputSchema(today: LocalDate) {
  return (
    z
      .object({
        templateIds: z.array(z.number().int().positive()).max(20).optional(),
        typeCode: z.enum(COMPONENT_TYPE_CODES, { error: "Choisis un type de pièce." }),
        position: z.enum(COMPONENT_POSITIONS, { error: "Choisis l'avant ou l'arrière." }),
        brand: optionalText(60),
        model: optionalText(80),
        reference: optionalText(60),
        origin: z.enum(["stock", "upgrade"]),
        installedOn: pastDate(today, "La date de montage ne peut pas être dans le futur."),
        initialDistanceM: integerIn(0, 1_000_000_000, "Distance invalide."),
        initialWearS: integerIn(0, 360_000_000, "Durée invalide."),
        purchasedOn: pastDate(today, "La date d'achat ne peut pas être dans le futur.").nullable(),
        purchasePriceCents: money,
        shop: z
          .object({
            name: z
              .string()
              .transform(cleanName)
              .pipe(z.string().min(1).max(100, "100 caractères au maximum.")),
            kind: z.enum(SHOP_KINDS),
          })
          .nullable(),
        warrantyEndsOn: date.nullable(),
        notes: optionalText(2000),
        suspension: suspensionSpecsSchema.nullable(),
      })
      .refine((part) => part.brand || part.model, {
        path: ["model"],
        error: "Indique au moins la marque ou le modèle.",
      })
      // Only a fork or a rear shock has suspension specs.
      .transform((part) =>
        isSuspensionType(part.typeCode) ? part : { ...part, suspension: null },
      ) satisfies z.ZodType<ComponentInput, unknown>
  );
}

export type ComponentFieldErrors = Partial<Record<keyof ComponentInput, string>>;

export function parseComponentInput(
  input: unknown,
  today: LocalDate,
): { success: true; data: ComponentInput } | { success: false; fieldErrors: ComponentFieldErrors } {
  const parsed = componentInputSchema(today).safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: ComponentFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ComponentInput | undefined;
    if (field) fieldErrors[field] ??= issue.message;
  }
  return { success: false, fieldErrors };
}

/**
 * The fitting instant (D-61): an original part counts every ride from the first day of the
 * bike; a part added later is fitted now when dated today, else at the end of its day.
 */
export function toComponentData(
  input: ComponentInput,
  now: number,
  timeZone: string,
): ComponentData {
  const { installedOn } = input;
  return {
    brand: input.brand,
    model: input.model,
    reference: input.reference,
    origin: input.origin,
    initialDistanceM: input.initialDistanceM,
    initialWearS: input.initialWearS,
    purchasedOn: input.purchasedOn,
    purchasePriceCents: input.purchasePriceCents,
    shop: input.shop,
    warrantyEndsOn: input.warrantyEndsOn,
    notes: input.notes,
    suspension: isSuspensionType(input.typeCode) ? input.suspension : undefined,
    installedAt:
      input.origin === "stock"
        ? startOfLocalDay(installedOn, timeZone)
        : eventInstant(installedOn, now, timeZone),
  };
}

export function replacePartSchema(today: LocalDate) {
  return z.object({
    removedComponentId: z.number().int().positive(),
    on: pastDate(today, "La date ne peut pas être dans le futur."),
    eventId: z.number().int().positive().nullable(),
    reason: z.enum(["worn", "broken", "crash", "upgrade", "other"], {
      error: "Choisis une raison.",
    }),
    removalNote: optionalText(200),
    fromItemId: z.number().int().positive().nullable(),
    brand: optionalText(60),
    model: z
      .string()
      .trim()
      .min(1, "Indique le modèle de la pièce montée.")
      .max(80, "80 caractères au maximum."),
    priceCents: money,
  }) satisfies z.ZodType<ReplacePartInput, unknown>;
}
