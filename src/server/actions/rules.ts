"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addDays, isLocalDate, localDateOf, startOfLocalDay } from "@/lib/format";
import type { SaveRuleResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createRule, getBike, listRules, snoozeRule, updateRule } from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { ruleInputSchema, toRuleData } from "./rule-input";

const id = z.number().int().positive();

/** "Nouvelle règle" (`ruleId` null) and "Modifier la règle". */
export async function saveRuleAction(
  bikeId: unknown,
  ruleId: unknown,
  input: unknown,
): Promise<SaveRuleResult> {
  const ctx = await requireAccessContext();
  const ids = z.object({ bikeId: id, ruleId: id.nullable() }).safeParse({ bikeId, ruleId });
  if (!ids.success) return { ok: false, error: "Règle introuvable." };
  const parsed = ruleInputSchema(today()).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const bike = getBike(ctx, ids.data.bikeId);
  if (!bike) return { ok: false, error: "Vélo introuvable." };
  const { timeZone } = getEnv();
  const trackedSince = bike.purchasedOn ?? localDateOf(bike.createdAt.getTime(), timeZone);
  const data = toRuleData(parsed.data, startOfLocalDay(trackedSince, timeZone), timeZone);

  if (ids.data.ruleId == null) {
    const outcome = createRule(ctx, bike.id, data);
    if (!outcome.ok) return { ok: false, error: "Vélo introuvable." };
  } else {
    const owned = listRules(ctx, bike.id).some((rule) => rule.id === ids.data.ruleId);
    if (!owned || !updateRule(ctx, ids.data.ruleId, data).ok) {
      return { ok: false, error: "Règle introuvable." };
    }
  }
  refresh();
  return { ok: true, message: `Règle enregistrée : ${data.title}` };
}

const SNOOZE_DAYS = 14;

/** "Reporter": snoozes a rule for two weeks; the answer carries what "Annuler" restores. */
export async function snoozeRuleAction(
  ruleId: unknown,
): Promise<
  { ok: true; message: string; previous: string | null } | { ok: false; message: string }
> {
  const ctx = await requireAccessContext();
  const parsed = id.safeParse(ruleId);
  if (!parsed.success) return { ok: false, message: "Règle introuvable." };
  const outcome = snoozeRule(ctx, parsed.data, addDays(today(), SNOOZE_DAYS));
  if (!outcome.ok) return { ok: false, message: "Règle introuvable." };
  refresh();
  return { ok: true, message: "Rappel reporté de 2 semaines", previous: outcome.previous };
}

/** "Annuler" after "Reporter" (D-60): puts the previous snooze back. */
export async function undoSnoozeAction(
  ruleId: unknown,
  previous: unknown,
): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const parsed = z
    .object({ ruleId: id, previous: z.string().refine(isLocalDate).nullable() })
    .safeParse({ ruleId, previous });
  if (!parsed.success || !snoozeRule(ctx, parsed.data.ruleId, parsed.data.previous).ok) {
    return { message: "Rien à annuler." };
  }
  refresh();
  return { message: "Report annulé" };
}
