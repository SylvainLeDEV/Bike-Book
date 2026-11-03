import "server-only";
import { z } from "zod";
import { slotLabel } from "@/lib/display";
import { COMPONENT_POSITIONS, COMPONENT_TYPE_CODES, type RuleStatus } from "@/lib/enums";
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
import { loadGarage } from "@/server/views/workshop";
import { bikeUrl } from "../describe";
import { answer, defineTool, refused } from "../tool";

// What a bike has done and cost (D-96): the bike record's counters and total cost (D-44), each
// fitted part's wear (D-13, D-43) and the parts that slot had before, with their wear at removal.
// All computed by the app's own functions, read-only.

/** Overdue or due soon; a part whose rules are fine, or snoozed, is left unmarked. */
const dueStatus = (status: RuleStatus | undefined) =>
  status === "overdue" || status === "due_soon" ? status : null;

const counterOf = (usage: Usage) => ({
  distance_m: usage.distanceM,
  wear_time_s: usage.wearS,
  ride_count: usage.rideIds.length,
});

function bikeUsage(ctx: AccessContext, bikeId: number) {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const { timeZone } = getEnv();
  const day = today();
  const rides = listRides(ctx, { bikeId });
  const events = listMaintenanceEvents(ctx, bikeId);
  const components = listComponents(ctx, bikeId);
  const groups = new Map(listComponentTypes().map((type) => [type.code, type.componentGroup]));
  const statuses = partStatuses(loadGarage(ctx).rules.get(bikeId) ?? [], components);
  const usage = usageBetween(rides, null, null);
  const cost = totalCost(bike, events, rides);
  const slots = fittedSlots(components, rides).sort(
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
        /** The worst status of the rules on this part (overdue, due_soon); null when none is due. */
        rule_status: dueStatus(statuses.get(fitted.id)),
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
    'What a bike has done and cost, as its page shows it: totals (distance in metres and wear time in seconds, with the counters before tracking; rides; last ride; last maintenance), total cost (purchase, upkeep at a shop and at home, sale; per 100 km over the rides\' distance), and each fitted part with its wear since fitted (distance, wear time: on lift-assisted rides the descent, D-13; counter_unit says which one the app shows), the worst status of its rules, and the parts that slot had before with their wear when removed and why. Answers "how many km on my chain?", "how long did my last chains last?", "what has this bike cost me?".',
  input: z.strictObject({ bike_id: z.number().describe("The bike (list_bikes).") }),
  run: (ctx, { bike_id: bikeId }) => {
    const usage = bikeUsage(ctx, bikeId);
    if (!usage) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    return answer(
      `${usage.bike.name}: ${Math.round(usage.totals.distance_m / 1000)} km, ${usage.parts.length} parts fitted.`,
      usage,
    );
  },
});

export const usageTools = [getBikeUsageTool];
