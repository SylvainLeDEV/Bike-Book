import "server-only";
import { z } from "zod";
import { slotLabel } from "@/lib/display";
import { COMPONENT_POSITIONS, COMPONENT_TYPE_CODES, type ComponentTypeCode } from "@/lib/enums";
import { daysBetween, localDateOf } from "@/lib/format";
import { REMOVAL_REASON_LABELS } from "@/lib/labels";
import {
  getBike,
  listComponents,
  listComponentTypes,
  listMaintenanceEvents,
  listRides,
  type AccessContext,
} from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import { componentName, counterUnit, fittedSlots } from "@/server/domain/components";
import { usageBetween, type Usage } from "@/server/domain/wear";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { totalCost } from "@/server/views/bikes";
import { partStatuses } from "@/server/views/rules";
import { bikeUrl, evaluatedBikeRules } from "../describe";
import { answer, defineTool, refused } from "../tool";

// What a bike has done and cost (D-96): the bike record's counters and total cost (D-44), each
// fitted part's wear (D-13, D-43) and the parts that slot had before, with their wear at removal.
// All computed by the app's own functions, read-only. Since D-100: a part's rule_status is ok
// when its rules are fine (null only without a rule), and a filter keeps one part or one type.

const counterOf = (usage: Usage) => ({
  distance_m: usage.distanceM,
  wear_time_s: usage.wearS,
  ride_count: usage.rideIds.length,
});

type PartFilter = { componentId?: number; typeCode?: ComponentTypeCode };

function bikeUsage(ctx: AccessContext, bikeId: number, filter: PartFilter = {}) {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const { timeZone } = getEnv();
  const day = today();
  const rides = listRides(ctx, { bikeId });
  const events = listMaintenanceEvents(ctx, bikeId);
  const components = listComponents(ctx, bikeId);
  const groups = new Map(listComponentTypes().map((type) => [type.code, type.componentGroup]));
  // Every bike's rules, ridden or not: a stored bike's parts keep their status.
  const statuses = partStatuses(evaluatedBikeRules(ctx, bikeId), components);
  const usage = usageBetween(rides, null, null);
  const cost = totalCost(bike, events, rides);
  const slots = fittedSlots(components, rides)
    .filter(
      ({ fitted, lineage }) =>
        (filter.typeCode == null || fitted.typeCode === filter.typeCode) &&
        (filter.componentId == null ||
          fitted.id === filter.componentId ||
          lineage.some((part) => part.id === filter.componentId)),
    )
    .sort(
      (a, b) =>
        COMPONENT_TYPE_CODES.indexOf(a.fitted.typeCode) -
          COMPONENT_TYPE_CODES.indexOf(b.fitted.typeCode) ||
        COMPONENT_POSITIONS.indexOf(a.fitted.position) -
          COMPONENT_POSITIONS.indexOf(b.fitted.position),
    );
  return {
    bike: { id: bike.id, name: bike.name, status: bike.status },
    totals: {
      /** With the distance and wear before tracking (initial counters). */
      distance_m: bike.initialDistanceM + usage.distanceM,
      wear_time_s: bike.initialWearS + usage.wearS,
      ride_count: rides.length,
      tracked_since: trackingStartOn(bike, timeZone),
      last_ride_on: rides[0] ? localDateOf(rides[0].startedAt, timeZone) : null,
      last_maintenance_on: events[0]?.performedOn ?? null,
      days_since_last_maintenance: events[0] ? daysBetween(events[0].performedOn, day) : null,
    },
    cost: {
      purchase_cents: cost.purchaseCents,
      upkeep_cents: cost.shopCents + cost.homeCents,
      shop_cents: cost.shopCents,
      shop_visits: cost.shopVisits,
      home_cents: cost.homeCents,
      sale_cents: cost.saleCents,
      /** Purchase + upkeep − sale. */
      total_cents: cost.totalCents,
      /** Over the distance of the rides only (not the distance before tracking). */
      ridden_distance_m: cost.riddenDistanceM,
      per_100_km_cents: cost.per100KmCents,
      per_100_km_upkeep_cents: cost.per100KmUpkeepCents,
    },
    parts: slots.map(({ fitted, lineage }) => {
      const group = groups.get(fitted.typeCode) ?? "other";
      return {
        component_id: fitted.id,
        type_code: fitted.typeCode,
        label: slotLabel(fitted.typeCode, fitted.position),
        name: componentName(fitted) || null,
        origin: fitted.origin,
        fitted_on: localDateOf(fitted.installedAt, timeZone),
        /** The counter the app shows for this kind of part: distance, or hours for suspension. */
        counter_unit: counterUnit(group),
        ...counterOf(fitted.counter),
        /**
         * The worst status of the active rules on this part: overdue, due_soon, snoozed, or ok
         * (rules, none due); null only when no active rule covers it.
         */
        rule_status: statuses.get(fitted.id) ?? null,
        previous_parts: lineage.map((part) => ({
          component_id: part.id,
          name: componentName(part) || null,
          fitted_on: localDateOf(part.installedAt, timeZone),
          removed_on: localDateOf(part.removedAt, timeZone),
          removal_reason: part.removalReason,
          removal_reason_label: part.removalReason
            ? REMOVAL_REASON_LABELS[part.removalReason]
            : null,
          /** Its wear when it was removed. */
          ...counterOf(part.counter),
        })),
      };
    }),
    bike_url: bikeUrl(bike.id),
  };
}

const getBikeUsageTool = defineTool({
  name: "get_bike_usage",
  title: "Usure et coût d'un vélo",
  kind: "read",
  description:
    'What a bike has done and cost, as its page shows it: totals (distance in metres and wear time in seconds, with the counters before tracking; rides; last ride; last maintenance), total cost (purchase, upkeep at a shop and at home, sale; per 100 km over the rides\' distance), and each fitted part with its wear since fitted (distance, wear time: on lift-assisted rides the descent, D-13; counter_unit says which one the app shows), rule_status (the worst of its active rules: overdue, due_soon, snoozed, ok when none is due; null only when no rule covers it: list_rules gives them), and the parts that slot had before with their wear when removed and why. type_code (chain, tire…) or component_id (a part fitted or removed: its slot) keeps only those parts; totals and cost stay the whole bike\'s. Answers "how many km on my chain?" (type_code chain), "how long did my last chains last?", "what has this bike cost me?".',
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    component_id: z
      .number()
      .optional()
      .describe("Only this part's slot (get_bike; a removed part: the slot it was in)."),
    type_code: z
      .enum(COMPONENT_TYPE_CODES)
      .optional()
      .describe("Only the parts of this type (list_component_types): chain, tire, brake_pads…"),
  }),
  run: (ctx, { bike_id: bikeId, component_id: componentId, type_code: typeCode }) => {
    if (componentId != null && !listComponents(ctx, bikeId).some((c) => c.id === componentId)) {
      return refused(
        [
          getBike(ctx, bikeId)
            ? { field: "component_id", message: "Pièce introuvable sur ce vélo." }
            : { field: "bike_id", message: "Vélo introuvable." },
        ],
        "Unknown part.",
      );
    }
    const usage = bikeUsage(ctx, bikeId, { componentId, typeCode });
    if (!usage) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const filtered = componentId != null || typeCode != null;
    return answer(
      `${usage.bike.name}: ${Math.round(usage.totals.distance_m / 1000)} km, ${usage.parts.length} part(s) ${filtered ? "matching" : "fitted"}.`,
      usage,
    );
  },
});

export const usageTools = [getBikeUsageTool];
