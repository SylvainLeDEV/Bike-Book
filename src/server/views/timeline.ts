import "server-only";
import { slotLabel } from "@/lib/display";
import type { MaintenanceAction } from "@/lib/enums";
import { localDateOf, localTimeOf } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type {
  AttachmentVM,
  MaintenanceEditVM,
  MaintenanceItemVM,
  QuickRideInput,
  RideItemVM,
  TaskItemVM,
  TimelineEdits,
  TimelineItemVM,
} from "@/lib/view-models";
import type { Component, MaintenanceEvent, MaintenanceItem, Ride, Run, Task } from "@/server/db";
import { eventCostCents } from "@/server/domain/cost";
import { rideDurationS, shownWearS } from "@/server/domain/rides";
import { eventInstant } from "@/server/domain/time";
import { odometerAt } from "@/server/domain/wear";
import { isPhoto } from "./attachments";
import { taskRow, type BikeRefSource } from "./refs";

/** A done task as the history shows it (D-77): at the local date of `done_at`. */
export type DoneTask = Task & { doneAt: number };

/** What each line of an event did to which part, once per part and action (D-107). */
export function eventParts(
  event: MaintenanceEvent,
  components: Component[],
): NonNullable<MaintenanceItemVM["parts"]> {
  const parts = new Map(components.map((part) => [part.id, part]));
  const seen = new Set<string>();
  return event.items.flatMap((line) => {
    const part = line.componentId == null ? undefined : parts.get(line.componentId);
    if (!part) return [];
    const slot = slotLabel(part.typeCode, part.position);
    const key = `${line.action}:${slot}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ action: line.action, slot }];
  });
}

/** A maintenance event as the history shows it. */
export function maintenanceEntry(event: MaintenanceEvent, bikeName: string): MaintenanceItemVM {
  return {
    kind: "maintenance",
    id: event.id,
    on: event.performedOn,
    bikeId: event.bikeId,
    bikeName,
    performedBy: event.performedBy,
    shopName: event.shop?.name ?? null,
    title: event.title,
    totalCostCents: eventCostCents(event),
    note: event.notes,
    laborTimeS: event.laborTimeS,
    documents: [],
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
    bikeId: ride.bikeId,
    bikeName,
    rideType: ride.rideType,
    title: ride.title ?? ride.location ?? RIDE_TYPE_LABELS[ride.rideType],
    location: ride.location,
    notes: ride.notes,
    distanceM: ride.distanceM,
    durationS: park ? null : rideDurationS(ride),
    totalTimeS: ride.totalTimeS,
    elevationGainM: ride.elevationGainM,
    runsCount: ride.runsCount,
    wearS: shownWearS(ride),
    conditions: ride.conditions,
    photos: [],
    documents: [],
  };
}

/** A done task as the history shows it (D-77); `bikeName` null for a general task. */
export function taskEntry(task: DoneTask, bikeName: string | null, timeZone: string): TaskItemVM {
  return {
    kind: "task",
    id: task.id,
    on: localDateOf(task.doneAt, timeZone),
    bikeId: task.bikeId,
    bikeName,
    title: task.title,
    note: task.notes,
    documents: [],
    photos: [],
  };
}

export type TimelineExtras = {
  /** The bike page's attachments by element (feature 10): thumbnails and documents of entries. */
  attachments?: Map<string, AttachmentVM[]>;
  /**
   * The bikes' counters before tracking, given only when `rides` holds every ride of these bikes:
   * each event and done task then gets its bike's counters at its instant (D-107).
   */
  counters?: Map<number, { initialDistanceM: number; initialWearS: number }>;
  /** The bikes' parts, removed ones included: each event names the parts its lines touched. */
  components?: Component[];
};

/**
 * Rides, maintenance events and done tasks, newest first, ordered by the instants the counters
 * use (D-61): a replacement recorded in the evening comes after that day's ride. A done task sits
 * at `done_at` (D-77).
 */
export function timeline(
  rides: Ride[],
  events: MaintenanceEvent[],
  tasks: DoneTask[],
  bikeNames: Map<number, string>,
  timeZone: string,
  { attachments, counters, components }: TimelineExtras = {},
): TimelineItemVM[] {
  const attach = <T extends TimelineItemVM>(item: T, key: string): T => {
    const list = attachments?.get(key) ?? [];
    return { ...item, photos: list.filter(isPhoto), documents: list.filter((a) => !isPhoto(a)) };
  };
  const ridesByBike = new Map<number, Ride[]>();
  for (const ride of rides)
    ridesByBike.set(ride.bikeId, [...(ridesByBike.get(ride.bikeId) ?? []), ride]);
  /** The bike's counters at `at`, when the timeline has all its rides (D-107). */
  const odometer = (bikeId: number | null, at: number) => {
    const bike = bikeId == null ? undefined : counters?.get(bikeId);
    return bike ? { odometer: odometerAt(bike, ridesByBike.get(bikeId!) ?? [], at) } : {};
  };
  const entries = [
    ...rides.map((ride) => ({
      at: ride.startedAt,
      item: attach(
        rideEntry(ride, bikeNames.get(ride.bikeId) ?? "", timeZone),
        `ride:${ride.id}`,
      ) as TimelineItemVM,
    })),
    ...events.map((event) => {
      const at = eventInstant(event.performedOn, event.createdAt, timeZone);
      return {
        at,
        item: attach(
          {
            ...maintenanceEntry(event, bikeNames.get(event.bikeId) ?? ""),
            ...(components ? { parts: eventParts(event, components) } : {}),
            ...odometer(event.bikeId, at),
          },
          `maintenance_event:${event.id}`,
        ) as TimelineItemVM,
      };
    }),
    ...tasks.map((task) => ({
      at: task.doneAt,
      item: attach(
        {
          ...taskEntry(
            task,
            task.bikeId == null ? null : (bikeNames.get(task.bikeId) ?? ""),
            timeZone,
          ),
          ...odometer(task.bikeId, task.doneAt),
        },
        `task:${task.id}`,
      ) as TimelineItemVM,
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
    title: ride.title,
    location: ride.location,
    notes: ride.notes,
    startTime: time === "12:00" ? null : time,
  };
}

/** What each entry of a timeline opens (D-70, D-77). */
export function timelineEdits(
  rides: Ride[],
  events: MaintenanceEvent[],
  tasks: DoneTask[],
  bikes: BikeRefSource[],
  timeZone: string,
  /** The runs the done tasks were done with: "Voir le suivi" (D-87). */
  runs: Pick<Run, "id" | "taskId" | "status">[] = [],
): TimelineEdits {
  return {
    rides: Object.fromEntries(rides.map((ride) => [ride.id, rideForm(ride, timeZone)])),
    eventBikeIds: Object.fromEntries(events.map((event) => [event.id, event.bikeId])),
    tasks: Object.fromEntries(
      tasks.map((task) => [task.id, taskRow(task, bikes, timeZone, [], runs)]),
    ),
  };
}

type LineItem = MaintenanceItem & { action: Exclude<MaintenanceAction, "replaced"> };

/** An event as "Modifier l'entretien" shows it (D-70); `components`: all the bike's parts. */
export function maintenanceEdit(
  event: MaintenanceEvent,
  components: Component[],
  fromRun = false,
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
    fromRun,
  };
}
