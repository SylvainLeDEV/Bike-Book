import "server-only";
import type { DashboardVM } from "@/lib/view-models";
import { listBikes, type AccessContext } from "@/server/db";
import { canBeRidden } from "@/server/domain/bikes";
import { today } from "@/server/time";
import { bikeCard } from "./bikes";

/** "Accueil": rules, tasks, restocking and activity arrive with features 4 to 9. */
export function getDashboardVM(ctx: AccessContext): DashboardVM {
  return {
    today: today(),
    firstName: ctx.user.name.trim().split(/\s+/)[0] ?? ctx.user.name,
    counts: { overdue: 0, dueSoon: 0, toRebuy: 0 },
    rules: [],
    tasks: [],
    bikes: listBikes(ctx)
      .filter((bike) => canBeRidden(bike.status))
      .map(bikeCard),
    rebuy: [],
    activity: [],
  };
}
