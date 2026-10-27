import "server-only";
import { localDateOf } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type { MaintenanceItemVM, RideItemVM, TimelineItemVM } from "@/lib/view-models";
import type { MaintenanceEvent, Ride } from "@/server/db";
import { eventCostCents } from "@/server/domain/cost";
import { rideDurationS, shownWearS } from "@/server/domain/rides";
import { eventInstant } from "@/server/domain/time";

/** A maintenance event as the history shows it. */
export function maintenanceEntry(event: MaintenanceEvent, bikeName: string): MaintenanceItemVM {
  return {
    kind: "maintenance",
    id: event.id,
    on: event.performedOn,
    bikeName,
    performedBy: event.performedBy,
    shopName: event.shop?.name ?? null,
    title: event.title,
    totalCostCents: eventCostCents(event),
    note: event.notes,
    invoices: [],
    photos: [],
  };
}

/** A ride as the timelines show it: its title, else its place, else its type. */
export function rideEntry(ride: Ride, bikeName: string, timeZone: string): RideItemVM {
  const park = ride.rideType === "bike_park";
  return {
    kind: "ride",
    id: ride.id,
    on: localDateOf(ride.startedAt, timeZone),
    bikeName,
    rideType: ride.rideType,
    title: ride.title ?? ride.location ?? RIDE_TYPE_LABELS[ride.rideType],
    distanceM: ride.distanceM,
    durationS: park ? null : rideDurationS(ride),
    totalTimeS: ride.totalTimeS,
    elevationGainM: ride.elevationGainM,
    runsCount: ride.runsCount,
    wearS: shownWearS(ride),
    conditions: ride.conditions,
    photos: [],
  };
}

/**
 * Rides and maintenance events, newest first, ordered by the instants the counters use (D-61):
 * a replacement recorded in the evening comes after that day's ride.
 */
export function timeline(
  rides: Ride[],
  events: MaintenanceEvent[],
  bikeNames: Map<number, string>,
  timeZone: string,
): TimelineItemVM[] {
  const entries = [
    ...rides.map((ride) => ({
      at: ride.startedAt,
      item: rideEntry(ride, bikeNames.get(ride.bikeId) ?? "", timeZone) as TimelineItemVM,
    })),
    ...events.map((event) => ({
      at: eventInstant(event.performedOn, event.createdAt, timeZone),
      item: maintenanceEntry(event, bikeNames.get(event.bikeId) ?? "") as TimelineItemVM,
    })),
  ];
  return entries.sort((a, b) => b.at - a.at).map((entry) => entry.item);
}
