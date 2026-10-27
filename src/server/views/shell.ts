import "server-only";
import type { QuickRideVM, ShellUserVM, ShopOption } from "@/lib/view-models";
import { listBikes, listRides, listShops, type AccessContext } from "@/server/db";
import { canBeRidden } from "@/server/domain/bikes";
import { quickRideDefaults } from "@/server/domain/rides";
import { today } from "@/server/time";
import { bikeRef } from "./refs";

export type AppFrameVM = {
  user: ShellUserVM;
  today: string;
  quickRide: QuickRideVM;
  shops: ShopOption[];
};

/** What the signed-in shell needs on every page: account, quick ride entry, bike sheet. */
export function getAppFrameVM(ctx: AccessContext): AppFrameVM {
  const day = today();
  const ridable = listBikes(ctx).filter((bike) => canBeRidden(bike.status));
  // The latest rides are enough to find the usual type and places.
  const defaults = quickRideDefaults(listRides(ctx, { limit: 500 }), ridable);
  return {
    user: { name: ctx.user.name, email: ctx.user.email, workspaceName: ctx.workspace.name },
    today: day,
    quickRide: {
      today: day,
      bikes: ridable.map((bike) => ({
        ...bikeRef(bike),
        usualRideType: defaults.usualRideType.get(bike.id) ?? "trail",
      })),
      defaultBikeId: defaults.defaultBikeId,
      recentLocations: defaults.recentLocations,
    },
    shops: listShops(ctx),
  };
}
