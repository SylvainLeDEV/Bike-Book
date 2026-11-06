"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatDate, isLocalDate, startOfLocalDay } from "@/lib/format";
import type { SaveRuleResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createRule, getBike, listRules, snoozeRule, updateRule } from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { ruleInputSchema, snoozeUntilSchema, toRuleData } from "./rule-input";

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
  const trackedSince = trackingStartOn(bike, timeZone);
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

/**
 * "Reporter" until a day the owner chose, or "Réactiver" (`until` null) (D-105); the answer
 * carries what "Annuler" restores.
 */
export async function snoozeRuleAction(
  ruleId: unknown,
  until: unknown,
): Promise<
  { ok: true; message: string; previous: string | null } | { ok: false; message: string }
> {
  const ctx = await requireAccessContext();
  const day = today();
  const parsed = z
    .object({ ruleId: id, until: snoozeUntilSchema(day).nullable() })
    .safeParse({ ruleId, until });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.path[0] === "until" ? issue.message : "Règle introuvable.",
    };
  }
  const end = parsed.data.until;
  const outcome = snoozeRule(ctx, parsed.data.ruleId, end);
  if (!outcome.ok) return { ok: false, message: "Règle introuvable." };
  refresh();
  return {
    ok: true,
    message: end ? `Reporté au ${formatDate(end, { year: "auto", today: day })}` : "Réactivé",
    previous: outcome.previous,
  };
}

/** "Annuler" after "Reporter" or "Réactiver" (D-60): puts the previous snooze back. */
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
  return { message: parsed.data.previous ? "Report rétabli" : "Report annulé" };
}
