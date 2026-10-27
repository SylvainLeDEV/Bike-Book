import "server-only";
import { slotLabel } from "@/lib/display";
import type { MaintenanceAction } from "@/lib/enums";
import { localDateOf, localTimeOf } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type {
  MaintenanceEditVM,
  MaintenanceItemVM,
  QuickRideInput,
  RideItemVM,
  TimelineEdits,
  TimelineItemVM,
} from "@/lib/view-models";
import type { Component, MaintenanceEvent, MaintenanceItem, Ride } from "@/server/db";
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

/** A ride as the ride sheet edits it (D-70): the quick entry's fields, noon meaning no time. */
export function rideForm(ride: Ride, timeZone: string): QuickRideInput {
  const park = ride.rideType === "bike_park";
  const time = localTimeOf(ride.startedAt, timeZone);
  return {
    bikeId: ride.bikeId,
    on: localDateOf(ride.startedAt, timeZone),
    rideType: ride.rideType,
    durationS: park ? null : (ride.totalTimeS ?? ride.movingTimeS),
    totalTimeS: park ? ride.totalTimeS : null,
    descentTimeS: park ? ride.descentTimeS : null,
    runsCount: park ? ride.runsCount : null,
    distanceM: ride.distanceM,
    elevationGainM: ride.elevationGainM,
    conditions: ride.conditions,
    location: ride.location,
    notes: ride.notes,
    startTime: time === "12:00" ? null : time,
  };
}

/** What each entry of a timeline opens (D-70). */
export function timelineEdits(
  rides: Ride[],
  events: MaintenanceEvent[],
  timeZone: string,
): TimelineEdits {
  return {
    rides: Object.fromEntries(rides.map((ride) => [ride.id, rideForm(ride, timeZone)])),
    eventBikeIds: Object.fromEntries(events.map((event) => [event.id, event.bikeId])),
  };
}

type LineItem = MaintenanceItem & { action: Exclude<MaintenanceAction, "replaced"> };

/** An event as "Modifier l'entretien" shows it (D-70); `components`: all the bike's parts. */
export function maintenanceEdit(
  event: MaintenanceEvent,
  components: Component[],
): MaintenanceEditVM {
  const parts = new Map(components.map((part) => [part.id, part]));
  const name = (id: number | null) => {
    const part = id == null ? undefined : parts.get(id);
    return (part && [part.brand, part.model].filter(Boolean).join(" ")) || "pièce inconnue";
  };
  const lines = event.items.filter((item): item is LineItem => item.action !== "replaced");
  const formerIds = new Set(
    lines.flatMap((line) =>
      line.componentId != null && parts.get(line.componentId)?.removedAt != null
        ? [line.componentId]
        : [],
    ),
  );
  const slot = (id: number | null) => {
    const part = id == null ? undefined : parts.get(id);
    return part ? slotLabel(part.typeCode, part.position) : "Pièce";
  };
  return {
    eventId: event.id,
    input: {
      bikeId: event.bikeId,
      on: event.performedOn,
      title: event.title,
      performedBy: event.performedBy,
      shop: event.shop ? { name: event.shop.name, kind: event.shop.kind } : null,
      totalCostCents: event.totalCostCents,
      notes: event.notes,
      lines: lines.map((line) => ({
        action: line.action,
        componentId: line.componentId,
        ruleId: line.ruleId,
        description: line.description,
        costCents: line.costCents,
        measurementValue: line.measurementValue,
        measurementUnit: line.measurementUnit,
      })),
    },
    replacements: event.items
      .filter((item) => item.action === "replaced")
      .map((item) => ({
        label: `${slot(item.componentId)} : ${name(item.componentId)} → ${name(item.newComponentId)}`,
        costCents: item.costCents,
      })),
    formerParts: [...formerIds].map((id) => ({
      id,
      label: `${slot(id)} · ${name(id)} (déposée)`,
    })),
  };
}
