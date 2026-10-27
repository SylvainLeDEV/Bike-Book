import "server-only";
import type { ActivityVM } from "@/lib/view-models";
import { listBikes, listMaintenanceEvents, listRides, type AccessContext } from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { timeline } from "./timeline";

/** Every ride and maintenance event of the workspace, newest first. */
export function getActivityVM(ctx: AccessContext): ActivityVM {
  const names = new Map(listBikes(ctx).map((bike) => [bike.id, bike.name]));
  const rides = listRides(ctx);
  const events = listMaintenanceEvents(ctx, null);
  return {
    today: today(),
    items: timeline(rides, events, names, getEnv().timeZone),
    rideCount: rides.length,
    maintenanceCount: events.length,
  };
}
