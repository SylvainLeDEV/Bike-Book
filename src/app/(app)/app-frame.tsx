"use client";

import { useRouter } from "next/navigation";
import { BikeSheetProvider } from "@/components/bike/bike-sheet";
import { TaskSheetProvider } from "@/components/plan/task-sheet";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNav } from "@/components/shell/shell-context";
import { useToast } from "@/components/ui/toast";
import type { ThemePreference } from "@/lib/theme";
import { saveBikeAction } from "@/server/actions/bikes";
import {
  createRideAction,
  deleteRideAction,
  undoCreateRideAction,
  updateRideAction,
} from "@/server/actions/rides";
import { createTaskAction } from "@/server/actions/tasks";
import { signOutAction } from "@/server/actions/session";
import type { AppFrameVM } from "@/server/views/shell";

export const APP_NAV: ShellNav = {
  home: "/",
  bikes: "/bikes",
  activity: "/activity",
  workshop: "/workshop",
};

/** The shell wired to the real Server Actions. */
export function AppFrame({
  frame,
  theme,
  children,
}: {
  frame: AppFrameVM;
  theme: ThemePreference;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const router = useRouter();
  return (
    <AppShell
      shell={{
        user: frame.user,
        nav: APP_NAV,
        theme,
        onSignOut: signOutAction,
        onOpenSettings: () => router.push("/settings"),
      }}
      quickRide={frame.quickRide}
      onQuickRideSubmit={async (input) => {
        const result = await createRideAction(input);
        if (!result.ok) return result;
        toast(result.message, {
          undo: async () => toast((await undoCreateRideAction(result.undoRideId)).message),
        });
      }}
      onRideUpdate={async (rideId, input) => {
        const result = await updateRideAction(rideId, input);
        if (result.ok) toast(result.message);
        return result;
      }}
      onRideDelete={async (rideId) => {
        const result = await deleteRideAction(rideId);
        if (result.ok) toast(result.message);
        return result;
      }}
    >
      <BikeSheetProvider
        today={frame.today}
        shops={frame.shops}
        onSubmit={async (bikeId, input) => {
          const result = await saveBikeAction(bikeId, input);
          if (result.ok) {
            toast(bikeId == null ? `Vélo ajouté : ${result.name}` : "Vélo enregistré");
            if (bikeId == null) router.push(`/bikes/${result.bikeId}`);
          }
          return result;
        }}
      >
        <TaskSheetProvider
          bikes={frame.quickRide.bikes}
          onSubmit={async (input) => {
            const result = await createTaskAction(input);
            if (!result.ok) return result.error;
            toast(result.message);
            return null;
          }}
        >
          {children}
        </TaskSheetProvider>
      </BikeSheetProvider>
    </AppShell>
  );
}
