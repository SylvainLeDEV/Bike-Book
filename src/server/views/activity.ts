import "server-only";
import type { ActivityVM, TimelineEdits } from "@/lib/view-models";
import { listBikes, listMaintenanceEvents, listRides, type AccessContext } from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { timeline, timelineEdits } from "./timeline";

/** Every ride and maintenance event of the workspace, newest first, and what each one opens. */
export function getActivityPage(ctx: AccessContext): { vm: ActivityVM; edits: TimelineEdits } {
  const { timeZone } = getEnv();
  const names = new Map(listBikes(ctx).map((bike) => [bike.id, bike.name]));
  const rides = listRides(ctx);
  const events = listMaintenanceEvents(ctx, null);
  return {
    vm: {
      today: today(),
      items: timeline(rides, events, names, timeZone),
      rideCount: rides.length,
      maintenanceCount: events.length,
    },
    edits: timelineEdits(rides, events, timeZone),
  };
}
