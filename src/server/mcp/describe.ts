import "server-only";
import { slotLabel } from "@/lib/display";
import { localDateOf, startOfLocalDay } from "@/lib/format";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import {
  getBike,
  listComponents,
  listComponentTypes,
  listRides,
  listRuleResets,
  listRules,
  listShops,
  listSuspensionSpecs,
  type AccessContext,
  type Bike,
  type Component,
  type Rule,
  type SuspensionSpecs,
} from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import type { RuleEvaluation } from "@/server/domain/rules";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { evaluateBikeRules } from "@/server/views/rules";

// What the MCP tools answer (D-90): the data's own names and units (D-50), in snake_case, with
// a French label where the assistant shows it to the owner. The frame number is never included.

/** Ids are left out of a dry run's answer: they would not be the real ones. */
export type Ids = "real" | "none";

const idOf = (id: number, ids: Ids) => (ids === "real" ? id : null);

export function bikeUrl(bikeId: number): string {
  return `${getEnv().publicUrl}/bikes/${bikeId}`;
}

export function bikeSummary(bike: Bike) {
  return {
    id: bike.id,
    name: bike.name,
    brand: bike.brand,
    model: bike.model,
    model_year: bike.modelYear,
    status: bike.status,
  };
}

function suspensionOf(specs: SuspensionSpecs | undefined) {
  return specs
    ? {
        spring_type: specs.springType,
        travel_mm: specs.travelMm,
        wheel_travel_mm: specs.wheelTravelMm,
        max_clicks: { ...specs.maxClicks },
      }
    : null;
}

export function describeComponent(
  component: Component,
  specs: SuspensionSpecs | undefined,
  ids: Ids = "real",
) {
  return {
    id: idOf(component.id, ids),
    bike_id: idOf(component.bikeId, ids),
    type_code: component.typeCode,
    type_label: COMPONENT_TYPE_LABELS[component.typeCode],
    position: component.position,
    label: slotLabel(component.typeCode, component.position),
    brand: component.brand,
    model: component.model,
    reference: component.reference,
    origin: component.origin,
    installed_on: localDateOf(component.installedAt, getEnv().timeZone),
    removed_on: component.removedAt ? localDateOf(component.removedAt, getEnv().timeZone) : null,
    initial_distance_m: component.initialDistanceM,
    initial_wear_s: component.initialWearS,
    purchased_on: component.purchasedOn,
    purchase_price_cents: component.purchasePriceCents,
    shop: component.shop ? { name: component.shop.name, kind: component.shop.kind } : null,
    warranty_ends_on: component.warrantyEndsOn,
    notes: component.notes,
    specs: component.specs,
    suspension: suspensionOf(specs),
  };
}

/**
 * A bike's active rules as the app evaluates them now (D-65, the same engine as "À prévoir"):
 * by rule id. Read inside a dry run, it is the state the write would leave.
 */
export function evaluateRules(ctx: AccessContext, bikeId: number): Map<number, RuleEvaluation> {
  const bike = getBike(ctx, bikeId);
  if (!bike) return new Map();
  const { timeZone } = getEnv();
  const evaluated = evaluateBikeRules({
    bike: {
      id: bike.id,
      name: bike.name,
      trackingStartAt: startOfLocalDay(trackingStartOn(bike, timeZone), timeZone),
    },
    rules: listRules(ctx, bikeId),
    resets: listRuleResets(ctx, bikeId),
    components: listComponents(ctx, bikeId),
    types: listComponentTypes(),
    rides: listRides(ctx, { bikeId }),
    now: Date.now(),
    today: today(),
    timeZone,
  });
  return new Map(evaluated.map(({ rule, evaluation }) => [rule.id, evaluation]));
}

export function describeRule(rule: Rule, ids: Ids = "real", evaluation?: RuleEvaluation) {
  return {
    id: idOf(rule.id, ids),
    title: rule.title,
    component_type_code: rule.componentTypeCode,
    position: rule.position,
    interval_distance_m: rule.intervalDistanceM,
    interval_wear_s: rule.intervalWearS,
    interval_days: rule.intervalDays,
    /** ok, due_soon, overdue or snoozed, as "À prévoir" shows it. */
    status: evaluation?.status ?? null,
    /** The day its counter starts from: the last time it was done, else the part's fitting. */
    counts_from: evaluation ? localDateOf(evaluation.lastReset.at, getEnv().timeZone) : null,
    /** Day-based rules: the day it falls due. */
    due_on: evaluation?.dueOn ?? null,
  };
}

/** The rules a write created, with their status; warns about those that start late. */
export function describeNewRules(
  ctx: AccessContext,
  bikeId: number,
  rules: Rule[],
  ids: Ids,
): { rules: ReturnType<typeof describeRule>[]; warnings: string[] } {
  const evaluations = evaluateRules(ctx, bikeId);
  const described = rules.map((rule) => describeRule(rule, ids, evaluations.get(rule.id)));
  const late = described.filter((rule) => rule.status === "overdue" || rule.status === "due_soon");
  const warnings = late.length
    ? [
        ids === "none"
          ? `${late.length} rule(s) would start overdue or due soon (rules_created[].status): they count from the part's fitting day. Ask the owner when each was last done and pass it as rules[].last_done_on (today if they do not know).`
          : `${late.length} rule(s) start overdue or due soon (rules_created[].status): the owner can set when each was last done in the app's "Règles" sheet.`,
      ]
    : [];
  return { rules: described, warnings };
}

/** A bike's full record and its fitted parts, or null (unknown or another workspace's). */
export function describeBike(ctx: AccessContext, bikeId: number, ids: Ids = "real") {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const specs = new Map(listSuspensionSpecs(ctx, bike.id).map((s) => [s.componentId, s]));
  return {
    id: idOf(bike.id, ids),
    name: bike.name,
    discipline: bike.discipline,
    is_electric: bike.isElectric,
    brand: bike.brand,
    model: bike.model,
    model_year: bike.modelYear,
    frame_size: bike.frameSize,
    wheel_size: bike.wheelSize,
    color: bike.color,
    weight_g: bike.weightG,
    purchased_on: bike.purchasedOn,
    purchase_price_cents: bike.purchasePriceCents,
    shop: bike.purchaseShop ? { name: bike.purchaseShop.name, kind: bike.purchaseShop.kind } : null,
    bought_used: bike.boughtUsed,
    initial_distance_m: bike.initialDistanceM,
    initial_wear_s: bike.initialWearS,
    status: bike.status,
    status_changed_on: bike.statusChangedOn,
    sale_price_cents: bike.salePriceCents,
    notes: bike.notes,
    url: ids === "real" ? bikeUrl(bike.id) : null,
    components: listComponents(ctx, bike.id)
      .filter((component) => component.removedAt == null)
      .map((component) => describeComponent(component, specs.get(component.id), ids)),
  };
}

/** What a write added around a bike: compare `before` with the state after it. */
export function snapshot(ctx: AccessContext, bikeId: number | null) {
  return {
    ruleIds: new Set(bikeId == null ? [] : listRules(ctx, bikeId).map((rule) => rule.id)),
    shopIds: new Set(listShops(ctx).map((shop) => shop.id)),
  };
}

export function addedSince(
  ctx: AccessContext,
  bikeId: number,
  before: ReturnType<typeof snapshot>,
) {
  return {
    rules: listRules(ctx, bikeId).filter((rule) => !before.ruleIds.has(rule.id)),
    shops: listShops(ctx).filter((shop) => !before.shopIds.has(shop.id)),
  };
}
