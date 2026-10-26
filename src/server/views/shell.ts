import "server-only";
import type { QuickRideVM, ShellUserVM, ShopOption } from "@/lib/view-models";
import { listBikes, listShops, type AccessContext } from "@/server/db";
import { canBeRidden, defaultRideType } from "@/server/domain/bikes";
import { today } from "@/server/time";
import { bikeRef } from "./bikes";

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
  return {
    user: { name: ctx.user.name, email: ctx.user.email, workspaceName: ctx.workspace.name },
    today: day,
    quickRide: {
      today: day,
      // Feature 4: the ride type most used with each bike, the last bike ridden, past places.
      bikes: ridable.map((bike) => ({
        ...bikeRef(bike),
        usualRideType: defaultRideType(bike.discipline),
      })),
      defaultBikeId: ridable[0]?.id ?? null,
      recentLocations: [],
    },
    shops: listShops(ctx),
  };
}
