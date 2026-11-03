import "server-only";
import { z } from "zod";
import { isLocalDate } from "@/lib/format";

// Validation of "Clé API Garmin" in Paramètres (D-101). The key is checked for its shape only:
// Garmin says whether it works on the first import.

const day = (message: string) =>
  z.string({ error: message }).trim().refine(isLocalDate, { error: message });

export const garminKeyInputSchema = z.object({
  /** Empty: keep the key already saved (only the dates change). */
  key: z
    .string()
    .trim()
    .refine((value) => value === "" || (value.length >= 16 && value.length <= 512), {
      error: "Colle la clé entière, telle que Garmin Connect l'a affichée.",
    })
    .refine((value) => !/\s/.test(value), { error: "La clé ne contient pas d'espace." }),
  keyExpiresOn: day("Indique la date d'expiration choisie à la création de la clé."),
  importFrom: day("Indique le jour à partir duquel importer les sorties."),
});

export type GarminKeyFormInput = z.infer<typeof garminKeyInputSchema>;

/** A Garmin type key ("gravel_cycling"), as the import stores it. */
export const activityTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,80}$/, "Type d'activité inconnu.");
