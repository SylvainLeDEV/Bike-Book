import "server-only";
import { z } from "zod";
import { COMPONENT_TYPE_CODES, type ComponentTypeCode } from "@/lib/enums";
import { endOfLocalDay, isLocalDate, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { RuleInput } from "@/lib/view-models";
import type { RuleData } from "@/server/db";

// Validation of the "Règles" sheet (D-50, feature 6).

const interval = (max: number, message: string) =>
  z.number({ error: message }).int(message).min(1, message).max(max, message).nullable();

export function ruleInputSchema(today: LocalDate) {
  return z
    .object({
      slot: z
        .string()
        .regex(/^(bike|[a-z_]+:(front|rear|\*))$/, "Emplacement invalide.")
        .refine(
          (slot) =>
            slot === "bike" ||
            (COMPONENT_TYPE_CODES as readonly string[]).includes(slot.split(":")[0]),
          "Emplacement invalide.",
        ),
      title: z
        .string()
        .transform(cleanName)
        .pipe(
          z.string().min(1, "Donne un titre à la règle.").max(120, "120 caractères au maximum."),
        ),
      intervalDistanceM: interval(100_000_000, "Distance invalide."),
      intervalWearS: interval(36_000_000, "Durée invalide."),
      intervalDays: interval(3650, "Entre 1 et 3650 jours."),
      warnRatio: z
        .number({ error: "Seuil invalide." })
        .min(0.5, "Seuil entre 50 et 99 %.")
        .max(0.99, "Seuil entre 50 et 99 %."),
      resetOnReplacement: z.boolean(),
      lastDoneOn: z
        .string()
        .refine(isLocalDate, "Date invalide.")
        .refine((date) => date <= today, "La date ne peut pas être dans le futur.")
        .nullable(),
      active: z.boolean(),
      notes: z
        .string()
        .trim()
        .max(2000, "2000 caractères au maximum.")
        .nullable()
        .transform((value) => value || null),
    })
    .refine(
      (rule) =>
        rule.intervalDistanceM != null || rule.intervalWearS != null || rule.intervalDays != null,
      {
        error: "Indique au moins un intervalle : km, heures ou jours.",
        path: ["intervalDistanceM"],
      },
    ) satisfies z.ZodType<RuleInput, unknown>;
}

/**
 * What a rule writes: its slot, and where its counter starts: the end of the day it was last
 * done (D-61), else the start of tracking.
 */
export function toRuleData(input: RuleInput, trackingStartAt: number, timeZone: string): RuleData {
  const [type, side] = input.slot === "bike" ? [null, null] : input.slot.split(":");
  return {
    componentTypeCode: type as ComponentTypeCode | null,
    position: side === "front" || side === "rear" ? side : null,
    title: input.title,
    intervalDistanceM: input.intervalDistanceM,
    intervalWearS: input.intervalWearS,
    intervalDays: input.intervalDays,
    warnRatio: input.warnRatio,
    resetOnReplacement: type != null && input.resetOnReplacement,
    counterStartAt: input.lastDoneOn ? endOfLocalDay(input.lastDoneOn, timeZone) : trackingStartAt,
    active: input.active,
    notes: input.notes,
  };
}
