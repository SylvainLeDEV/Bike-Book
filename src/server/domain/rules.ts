import "server-only";
import type { ComponentTypeCode, RuleStatus } from "@/lib/enums";
import { addDays, daysBetween, localDateOf, type LocalDate } from "@/lib/format";
import { usageBetween, type RideUsage } from "./wear";

// The rule engine (docs/03, wear counters): last reset, usage since, ratio, status and ETA, with
// the sources each figure comes from ("Voir le détail", principle 2).

export type RuleDefinition = {
  id: number;
  componentTypeCode: ComponentTypeCode | null;
  /** null: every part of the type (or the whole bike). */
  position: "front" | "rear" | "none" | null;
  intervalDistanceM: number | null;
  intervalWearS: number | null;
  intervalDays: number | null;
  warnRatio: number;
  resetOnReplacement: boolean;
  counterStartAt: number;
  snoozeEndsOn: LocalDate | null;
};

/** A maintenance line that fulfilled a rule, at its event's instant (D-61). */
export type RuleReset = { ruleId: number; at: number; eventId: number; on: LocalDate };

/** A part of the bike, for the replacement reset. */
export type SlotPart = {
  id: number;
  typeCode: ComponentTypeCode;
  position: "front" | "rear" | "none";
  installedAt: number;
  removedAt: number | null;
};

export type LastReset =
  | { kind: "maintenance"; at: number; eventId: number }
  | { kind: "replacement"; at: number; componentId: number }
  | { kind: "start"; at: number };

export type RuleUnit = "distance_m" | "duration_s" | "days";

export type RuleEvaluation = {
  status: RuleStatus;
  /** Highest of the interval ratios (1.13 = 113 %). */
  ratio: number;
  /** The interval that drives the ratio. */
  driving: { unit: RuleUnit; used: number; interval: number };
  usage: { distanceM: number; wearS: number; days: number };
  lastReset: LastReset;
  /** Day-driven rules: the day it falls due. */
  dueOn: LocalDate | null;
  /** Days until due at the pace of the last 8 weeks (Estimate); null when overdue or no pace. */
  etaDays: number | null;
  /** The rides counted since the last reset. */
  rideIds: number[];
};

const DAY_MS = 86_400_000;
export const PACE_WINDOW_DAYS = 56;

/** Whether a part sits in the rule's slot. */
export function inSlot(
  rule: Pick<RuleDefinition, "componentTypeCode" | "position">,
  part: Pick<SlotPart, "typeCode" | "position">,
): boolean {
  if (rule.componentTypeCode == null || part.typeCode !== rule.componentTypeCode) return false;
  return rule.position == null || rule.position === "none" || rule.position === part.position;
}

/**
 * The latest of: the last maintenance line linked to the rule; the fitting of the slot's current
 * part (when replacing restarts the rule); the counter start.
 */
export function lastResetOf(
  rule: RuleDefinition,
  resets: RuleReset[],
  parts: SlotPart[],
  now: number,
): LastReset {
  let last: LastReset = { kind: "start", at: rule.counterStartAt };
  for (const reset of resets) {
    if (reset.ruleId === rule.id && reset.at <= now && reset.at >= last.at) {
      last = { kind: "maintenance", at: reset.at, eventId: reset.eventId };
    }
  }
  if (rule.resetOnReplacement) {
    for (const part of parts) {
      if (part.removedAt == null && inSlot(rule, part) && part.installedAt > last.at) {
        last = { kind: "replacement", at: part.installedAt, componentId: part.id };
      }
    }
  }
  return last;
}

export function evaluateRule(
  rule: RuleDefinition,
  context: {
    rides: RideUsage[];
    resets: RuleReset[];
    parts: SlotPart[];
    now: number;
    today: LocalDate;
    timeZone: string;
  },
): RuleEvaluation {
  const { rides, now, today, timeZone } = context;
  const lastReset = lastResetOf(rule, context.resets, context.parts, now);
  const since = usageBetween(rides, lastReset.at, null);
  const resetOn = localDateOf(lastReset.at, timeZone);
  const days = Math.max(0, daysBetween(resetOn, today));

  const measures: { unit: RuleUnit; used: number; interval: number }[] = [];
  if (rule.intervalDistanceM) {
    measures.push({ unit: "distance_m", used: since.distanceM, interval: rule.intervalDistanceM });
  }
  if (rule.intervalWearS) {
    measures.push({ unit: "duration_s", used: since.wearS, interval: rule.intervalWearS });
  }
  if (rule.intervalDays) measures.push({ unit: "days", used: days, interval: rule.intervalDays });
  const driving = measures.reduce((best, m) =>
    m.used / m.interval > best.used / best.interval ? m : best,
  );
  const ratio = driving.used / driving.interval;

  const snoozed = rule.snoozeEndsOn != null && today < rule.snoozeEndsOn;
  const status: RuleStatus = snoozed
    ? "snoozed"
    : ratio >= 1
      ? "overdue"
      : ratio >= rule.warnRatio
        ? "due_soon"
        : "ok";

  // Pace: average daily usage over the last 8 weeks.
  const pace = usageBetween(rides, now - PACE_WINDOW_DAYS * DAY_MS, now);
  const etas = measures.map((m) => {
    const remaining = m.interval - m.used;
    if (m.unit === "days") return remaining;
    const perDay = (m.unit === "distance_m" ? pace.distanceM : pace.wearS) / PACE_WINDOW_DAYS;
    return perDay > 0 ? remaining / perDay : Number.POSITIVE_INFINITY;
  });
  const soonest = Math.min(...etas);
  const etaDays = ratio >= 1 || !Number.isFinite(soonest) ? null : Math.max(0, Math.ceil(soonest));

  return {
    status,
    ratio,
    driving,
    usage: { distanceM: since.distanceM, wearS: since.wearS, days },
    lastReset,
    dueOn:
      driving.unit === "days" && rule.intervalDays ? addDays(resetOn, rule.intervalDays) : null,
    etaDays,
    rideIds: since.rideIds,
  };
}

const STATUS_ORDER: Record<RuleStatus, number> = { overdue: 0, due_soon: 1, snoozed: 2, ok: 3 };

/** Most urgent first: overdue, due soon, snoozed, up to date; then by ratio. */
export function byUrgency<T extends { status: RuleStatus; ratio: number }>(a: T, b: T): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.ratio - a.ratio;
}
