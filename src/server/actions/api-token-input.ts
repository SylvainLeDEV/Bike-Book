import "server-only";
import { z } from "zod";

// Validation of "Nouveau jeton" (D-90): a name to recognise it in the list.

export const apiTokenInputSchema = z.object({
  name: z
    .string({ error: "Donne un nom au jeton." })
    .trim()
    .min(1, "Donne un nom au jeton.")
    .max(60, "60 caractères au maximum."),
});
