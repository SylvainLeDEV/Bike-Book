import "server-only";
import { z } from "zod";
import { BIKE_STATUSES, DISCIPLINES, SHOP_KINDS, WHEEL_SIZES } from "@/lib/enums";
import { isLocalDate, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { BikeInput } from "@/lib/view-models";
import type { Bike, BikeData } from "@/server/db";
import { resolveBikeStatus } from "@/server/domain/bikes";

// Validation of the bike sheet (D-50: clean on the way in). The sheet already converts what
// was typed into raw units; this schema checks it again, because a Server Action is a public
// endpoint. Error messages are shown under the fields, in French.

/** Optional text: trimmed, empty becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => (value ? value : null));

const integerIn = (min: number, max: number, message: string) =>
  z.number({ error: message }).int(message).min(min, message).max(max, message);

const pastDate = (today: LocalDate, message: string) =>
  z
    .string()
    .refine(isLocalDate, "Date invalide.")
    .refine((date) => date <= today, message)
    .nullable();

const MAX_CENTS = 100_000_000; // 1 000 000 €
const money = integerIn(0, MAX_CENTS, "Montant invalide.").nullable();

export function bikeInputSchema(today: LocalDate) {
  return z
    .object({
      name: z
        .string()
        .transform(cleanName)
        .pipe(z.string().min(1, "Donne un nom au vélo.").max(60, "60 caractères au maximum.")),
      brand: optionalText(60),
      model: optionalText(80),
      modelYear: integerIn(1900, 2100, "Année entre 1900 et 2100.").nullable(),
      discipline: z.enum(DISCIPLINES, { error: "Choisis une discipline." }),
      isElectric: z.boolean(),
      status: z.enum(BIKE_STATUSES, { error: "Choisis un statut." }),
      soldOn: pastDate(today, "La date de vente ne peut pas être dans le futur."),
      salePriceCents: money,
      frameSize: optionalText(20),
      wheelSize: z.enum(WHEEL_SIZES, { error: "Taille de roue inconnue." }).nullable(),
      color: optionalText(60),
      weightG: integerIn(1, 100_000, "Poids entre 0,001 et 100 kg.").nullable(),
      frameSerial: optionalText(60),
      notes: optionalText(2000),
      purchasedOn: pastDate(today, "La date d'achat ne peut pas être dans le futur."),
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
      boughtUsed: z.boolean(),
      initialDistanceM: integerIn(0, 1_000_000_000, "Distance invalide."),
      initialWearS: integerIn(0, 360_000_000, "Durée invalide."),
    })
    .refine((bike) => !bike.soldOn || !bike.purchasedOn || bike.soldOn >= bike.purchasedOn, {
      path: ["soldOn"],
      error: "La vente ne peut pas précéder l'achat.",
    }) satisfies z.ZodType<BikeInput, unknown>;
}

export type BikeFieldErrors = Partial<Record<keyof BikeInput, string>>;

export type ParsedBikeInput =
  { success: true; data: BikeInput } | { success: false; fieldErrors: BikeFieldErrors };

/** Validates what the sheet sent; the first error of each field. */
export function parseBikeInput(input: unknown, today: LocalDate): ParsedBikeInput {
  const parsed = bikeInputSchema(today).safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: BikeFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof BikeInput | undefined;
    if (field) fieldErrors[field] ??= issue.message;
  }
  return { success: false, fieldErrors };
}

/** What to write for a validated input: the fields, plus the status columns (D-43). */
export function toBikeData(input: BikeInput, previous: Bike | null, today: LocalDate): BikeData {
  // The sale date and price become status columns; the shop is resolved by the data layer.
  const { soldOn, salePriceCents, status, shop, ...fields } = input;
  return {
    ...fields,
    purchaseShop: shop,
    ...resolveBikeStatus(
      previous,
      { status, soldOn, salePriceCents, purchasedOn: input.purchasedOn },
      today,
    ),
  };
}
