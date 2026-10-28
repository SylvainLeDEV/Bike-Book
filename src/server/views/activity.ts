import "server-only";
import type { ActivityVM, TimelineEdits } from "@/lib/view-models";
import {
  listBikes,
  listDoneTasks,
  listMaintenanceEvents,
  listRides,
  type AccessContext,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { timeline, timelineEdits } from "./timeline";

/**
 * Every ride, maintenance event and done task of the workspace (general tasks included, D-77),
 * newest first, and what each one opens.
 */
export function getActivityPage(ctx: AccessContext): { vm: ActivityVM; edits: TimelineEdits } {
  const { timeZone } = getEnv();
  const bikes = listBikes(ctx);
  const names = new Map(bikes.map((bike) => [bike.id, bike.name]));
  const rides = listRides(ctx);
  const events = listMaintenanceEvents(ctx, null);
  const tasks = listDoneTasks(ctx);
  return {
    vm: {
      today: today(),
      items: timeline(rides, events, tasks, names, timeZone),
      rideCount: rides.length,
      maintenanceCount: events.length,
      doneTaskCount: tasks.length,
    },
    edits: timelineEdits(rides, events, tasks, bikes, timeZone),
  };
}
