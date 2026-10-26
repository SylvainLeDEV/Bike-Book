"use client";

import { useRouter } from "next/navigation";
import { BikeSheetProvider } from "@/components/bike/bike-sheet";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNav } from "@/components/shell/shell-context";
import { useToast } from "@/components/ui/toast";
import type { ThemePreference } from "@/lib/theme";
import { saveBikeAction } from "@/server/actions/bikes";
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
        // Feature 12 brings the settings page (account, ZIP export); the theme is in the top bar.
        onOpenSettings: () => toast("Les réglages arrivent avec l'export des données."),
      }}
      quickRide={frame.quickRide}
      // Feature 4 saves rides.
      onQuickRideSubmit={() =>
        toast("L'enregistrement des sorties arrive dans la prochaine version.")
      }
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
        {children}
      </BikeSheetProvider>
    </AppShell>
  );
}
