import "server-only";
import { slotLabel } from "@/lib/display";
import {
  COMPONENT_TYPE_CODES,
  type ComponentGroup,
  type ComponentTypeCode,
  type RuleStatus,
} from "@/lib/enums";
import { localDateOf, type LocalDate } from "@/lib/format";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import type {
  MaintenanceFormVM,
  MaintenanceLineInput,
  Quantity,
  RuleFormVM,
  RuleRowVM,
  RuleSlotOption,
  RulesSheetVM,
} from "@/lib/view-models";
import type { Component, ComponentType, Rule } from "@/server/db";
import { componentName } from "@/server/domain/components";
import {
  byUrgency,
  evaluateRule,
  inSlot,
  type RuleEvaluation,
  type RuleReset,
} from "@/server/domain/rules";
import { eventInstant } from "@/server/domain/time";
import type { RideUsage } from "@/server/domain/wear";
import { bikeRef } from "./refs";

// Rule view models (feature 6): "À prévoir" rows, the parts' status marks, the "C'est fait"
// prefill, and the "Règles" sheet. Everything is evaluated by the pure engine.

export type BikeRulesInput = {
  bike: { id: number; name: string; trackingStartAt: number };
  rules: Rule[];
  resets: { ruleId: number; eventId: number; on: LocalDate; recordedAt: number }[];
  components: Component[];
  types: ComponentType[];
  rides: RideUsage[];
  now: number;
  today: LocalDate;
  timeZone: string;
};

export type EvaluatedRule = { rule: Rule; evaluation: RuleEvaluation; row: RuleRowVM };

function quantity(unit: RuleEvaluation["driving"]["unit"], value: number): Quantity {
  return { unit, value } as Quantity;
}

/** "Freins avant et arrière" for a rule on both sides, else the slot's own label. */
function ruleSlotLabel(type: ComponentTypeCode, position: Rule["position"], hasPosition: boolean) {
  if (hasPosition && position == null) {
    const label = COMPONENT_TYPE_LABELS[type];
    return `${/[sx]$/.test(label) ? label : `${label}s`} avant et arrière`;
  }
  return slotLabel(type, position ?? "none");
}

export function evaluateBikeRules(input: BikeRulesInput): EvaluatedRule[] {
  const { bike, components, timeZone } = input;
  const resets: RuleReset[] = input.resets.map((reset) => ({
    ruleId: reset.ruleId,
    eventId: reset.eventId,
    on: reset.on,
    at: eventInstant(reset.on, reset.recordedAt, timeZone),
  }));
  const types = new Map(input.types.map((type) => [type.code, type]));
  const fitted = components.filter((component) => component.removedAt == null);
  return input.rules
    .filter((rule) => rule.active)
    .map((rule) => {
      const evaluation = evaluateRule(rule, { ...input, resets, parts: components });
      const type = rule.componentTypeCode ? types.get(rule.componentTypeCode) : undefined;
      const inThisSlot = fitted.filter((part) => inSlot(rule, part));
      const lastReset = evaluation.lastReset;
      const row: RuleRowVM = {
        id: rule.id,
        bike: bikeRef(bike),
        slot:
          rule.componentTypeCode && type
            ? {
                group: type.componentGroup as ComponentGroup,
                typeLabel: ruleSlotLabel(rule.componentTypeCode, rule.position, type.hasPosition),
                model: inThisSlot.length === 1 ? componentName(inThisSlot[0]) || null : null,
              }
            : null,
        title: rule.title,
        status: evaluation.status,
        ratio: evaluation.ratio,
        warnRatio: rule.warnRatio,
        used: quantity(evaluation.driving.unit, evaluation.driving.used),
        interval: quantity(evaluation.driving.unit, evaluation.driving.interval),
        dueOn: evaluation.dueOn,
        etaDays: evaluation.etaDays,
        lastDoneOn:
          lastReset.kind === "start" || lastReset.at <= bike.trackingStartAt
            ? null
            : localDateOf(lastReset.at, timeZone),
        stock: null,
      };
      return { rule, evaluation, row };
    })
    .sort((a, b) => byUrgency(a.row, b.row));
}

/** The worst status of the rules covering each fitted part ("snoozed" and "ok" left unmarked). */
export function partStatuses(evaluated: EvaluatedRule[], components: Component[]) {
  const order: Record<RuleStatus, number> = { overdue: 0, due_soon: 1, snoozed: 2, ok: 3 };
  const statuses = new Map<number, RuleStatus>();
  for (const part of components) {
    if (part.removedAt != null) continue;
    for (const { rule, evaluation } of evaluated) {
      if (!inSlot(rule, part)) continue;
      const current = statuses.get(part.id);
      if (!current || order[evaluation.status] < order[current]) {
        statuses.set(part.id, evaluation.status);
      }
    }
  }
  return statuses;
}

/** "C'est fait" (D-63): the maintenance sheet with one line fulfilling the rule. */
export function donePrefill(
  evaluated: EvaluatedRule[],
  components: Component[],
): Record<number, { title: string; lines: MaintenanceLineInput[] }> {
  const fitted = components.filter((component) => component.removedAt == null);
  return Object.fromEntries(
    evaluated.map(({ rule }) => {
      const part = fitted.find((component) => inSlot(rule, component));
      return [
        rule.id,
        {
          title: rule.title,
          lines: [
            {
              action: rule.componentTypeCode === "brake" ? "bled" : "serviced",
              componentId: part?.id ?? null,
              ruleId: rule.id,
              description: null,
              costCents: null,
              measurementValue: null,
              measurementUnit: null,
            },
          ],
        },
      ];
    }),
  );
}

/** The rules a maintenance line can fulfil, per part. */
export function maintenanceRules(
  rules: Rule[],
  components: Component[],
): MaintenanceFormVM["rules"] {
  const fitted = components.filter((component) => component.removedAt == null);
  return rules
    .filter((rule) => rule.active)
    .map((rule) => ({
      id: rule.id,
      title: rule.title,
      componentIds: fitted.filter((part) => inSlot(rule, part)).map((part) => part.id),
      bikeLevel: rule.componentTypeCode == null,
    }));
}

/** The slots a rule can target: the bike, each fitted slot, and both sides of front/rear types. */
export function ruleSlots(components: Component[], types: ComponentType[]): RuleSlotOption[] {
  const hasPosition = new Map(types.map((type) => [type.code, type.hasPosition]));
  const seen = new Set<string>();
  const options: RuleSlotOption[] = [{ value: "bike", label: "Vélo entier" }];
  const fitted = components
    .filter((component) => component.removedAt == null)
    .sort(
      (a, b) => COMPONENT_TYPE_CODES.indexOf(a.typeCode) - COMPONENT_TYPE_CODES.indexOf(b.typeCode),
    );
  for (const part of fitted) {
    const both = hasPosition.get(part.typeCode) ? `${part.typeCode}:*` : null;
    if (both && !seen.has(both)) {
      seen.add(both);
      options.push({ value: both, label: ruleSlotLabel(part.typeCode, null, true) });
    }
    const value = `${part.typeCode}:${part.position === "none" ? "*" : part.position}`;
    if (!seen.has(value)) {
      seen.add(value);
      options.push({ value, label: slotLabel(part.typeCode, part.position) });
    }
  }
  return options;
}

export function slotValue(rule: Pick<Rule, "componentTypeCode" | "position">): string {
  return rule.componentTypeCode ? `${rule.componentTypeCode}:${rule.position ?? "*"}` : "bike";
}

export function rulesSheet(input: BikeRulesInput, evaluated: EvaluatedRule[]): RulesSheetVM {
  const byId = new Map(evaluated.map((entry) => [entry.rule.id, entry]));
  const options = ruleSlots(input.components, input.types);
  const rules: RuleFormVM[] = input.rules.map((rule) => {
    const entry = byId.get(rule.id);
    const evaluation = entry?.evaluation;
    // Keep the slot of a rule whose parts were removed in the list.
    if (!options.some((option) => option.value === slotValue(rule)) && rule.componentTypeCode) {
      options.push({
        value: slotValue(rule),
        label: ruleSlotLabel(rule.componentTypeCode, rule.position, rule.position == null),
      });
    }
    return {
      id: rule.id,
      slot: slotValue(rule),
      title: rule.title,
      intervalDistanceM: rule.intervalDistanceM,
      intervalWearS: rule.intervalWearS,
      intervalDays: rule.intervalDays,
      warnRatio: rule.warnRatio,
      resetOnReplacement: rule.resetOnReplacement,
      lastDoneOn:
        rule.counterStartAt > input.bike.trackingStartAt
          ? localDateOf(rule.counterStartAt, input.timeZone)
          : null,
      active: rule.active,
      notes: rule.notes,
      status: evaluation?.status ?? null,
      explanation: evaluation
        ? {
            since: localDateOf(evaluation.lastReset.at, input.timeZone),
            source: evaluation.lastReset.kind,
            rideCount: evaluation.rideIds.length,
            distanceM: evaluation.usage.distanceM,
            wearS: evaluation.usage.wearS,
            days: evaluation.usage.days,
            ratio: evaluation.ratio,
            etaDays: evaluation.etaDays,
          }
        : null,
    };
  });
  return {
    today: input.today,
    bike: { id: input.bike.id, name: input.bike.name },
    slots: options,
    rules,
  };
}
