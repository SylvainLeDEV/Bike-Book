import "server-only";
import { z } from "zod";
import { COMPONENT_TYPE_CODES, PROCEDURE_DIFFICULTIES } from "@/lib/enums";
import { cleanName } from "@/lib/names";
import type { ProcedureData } from "@/server/db";

// Validation of the procedure editor ("Nouvelle fiche", "Modifier la fiche", D-86; D-50: clean
// on the way in). Each message says which step, line or link it is about.

const id = z.number().int().positive();

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => value || null);

const required = (max: number, message: string) =>
  z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(1, message).max(max, `${max} caractères au maximum.`));

/** Only http(s) pages: shown and opened in a new tab, never fetched or embedded (D-09). */
const pageUrl = z
  .url({ protocol: /^https?$/, error: "Adresse invalide : elle doit commencer par https://" })
  .max(2000);

const typeCode = z.enum(COMPONENT_TYPE_CODES);

const step = z.object({
  id: id.nullable(),
  instruction: z
    .string()
    .trim()
    .min(1, "Chaque étape a besoin d'une consigne.")
    .max(2000, "2000 caractères au maximum."),
  note: text(1000),
  torqueNm: z
    .number({ error: "Couple de serrage invalide." })
    .gt(0, "Couple de serrage invalide.")
    .max(500, "Couple de serrage invalide.")
    .nullable(),
});

const quantity = z
  .number({ error: "Quantité invalide." })
  .int("Quantité invalide.")
  .min(1, "Quantité invalide.")
  .max(100, "Quantité invalide.")
  .nullable();

const line = z.discriminatedUnion("target", [
  z.object({ target: z.literal("item"), itemId: id, quantity }),
  z.object({ target: z.literal("type"), componentTypeCode: typeCode, quantity }),
  z.object({
    target: z.literal("label"),
    label: required(120, "Nomme le matériel à ajouter."),
    quantity,
  }),
]);

const resource = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("video"),
    url: pageUrl,
    title: text(120),
    durationS: z.number().int().min(1).max(86_400).nullable(),
    body: z.null(),
  }),
  z.object({
    kind: z.literal("link"),
    url: pageUrl,
    title: text(120),
    durationS: z.null(),
    body: z.null(),
  }),
  z.object({
    kind: z.literal("note"),
    url: z.null(),
    title: text(120),
    durationS: z.null(),
    body: z
      .string()
      .trim()
      .min(1, "Une note ne peut pas être vide.")
      .max(2000, "2000 caractères au maximum."),
  }),
]);

export const procedureInputSchema = z.object({
  title: required(120, "Donne un titre à la fiche."),
  description: text(2000),
  componentTypeCode: typeCode.nullable(),
  modelHint: text(80),
  bikes: z.union([z.literal("all"), z.array(id).max(50)]),
  durationMin: z
    .number({ error: "Durée invalide." })
    .int("Durée invalide.")
    .min(1, "Durée invalide.")
    .max(1440, "Durée invalide.")
    .nullable(),
  difficulty: z.enum(PROCEDURE_DIFFICULTIES).nullable(),
  steps: z.array(step).max(60, "60 étapes au maximum."),
  lines: z.array(line).max(60, "60 lignes de matériel au maximum."),
  resources: z.array(resource).max(30, "30 ressources au maximum."),
});

const PLACES: Record<string, (index: number) => string> = {
  steps: (i) => `Étape ${i + 1}`,
  lines: (i) => `Matériel, ligne ${i + 1}`,
  resources: (i) => `Ressource ${i + 1}`,
};

/** The editor's input, checked and turned into what the data-access layer stores. */
export function parseProcedureInput(
  input: unknown,
): { ok: true; data: ProcedureData } | { ok: false; error: string } {
  const parsed = procedureInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [list, index] = issue?.path ?? [];
    const place =
      typeof list === "string" && typeof index === "number" && PLACES[list]
        ? `${PLACES[list](index)} : `
        : "";
    return { ok: false, error: `${place}${issue?.message ?? "Saisie invalide."}` };
  }
  const value = parsed.data;
  return {
    ok: true,
    data: {
      title: value.title,
      description: value.description,
      componentTypeCode: value.componentTypeCode,
      modelHint: value.modelHint,
      allBikes: value.bikes === "all",
      bikeIds: value.bikes === "all" ? [] : value.bikes,
      estimatedDurationS: value.durationMin == null ? null : value.durationMin * 60,
      difficulty: value.difficulty,
      steps: value.steps,
      items: value.lines.map((l) =>
        l.target === "item"
          ? { inventoryItemId: l.itemId, quantity: l.quantity }
          : l.target === "type"
            ? { componentTypeCode: l.componentTypeCode, quantity: l.quantity }
            : { label: l.label, quantity: l.quantity },
      ),
      resources: value.resources,
    },
  };
}
