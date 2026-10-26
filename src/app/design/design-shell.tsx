"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { AppShell } from "@/components/shell/app-shell";
import { useToast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/format";
import type { ThemePreference } from "@/lib/theme";
import { DEMO_USER, QUICK_RIDE } from "./fixtures";

const SCREENS = [
  { href: "/design", label: "Accueil" },
  { href: "/design/bike", label: "Page vélo" },
  { href: "/design/workshop", label: "Atelier" },
  { href: "/design/foundation", label: "Fondation" },
];

export const DESIGN_NAV = {
  home: "/design",
  bikes: "/design/bike",
  activity: "/design/activity",
  workshop: "/design/workshop",
};

/** The real app shell, fed with fixtures; actions only show what they would do. */
export function DesignShell({
  theme,
  children,
}: {
  theme: ThemePreference;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const pathname = usePathname();
  return (
    <AppShell
      shell={{
        user: DEMO_USER,
        nav: DESIGN_NAV,
        theme,
        onSignOut: () => toast("Déconnexion : désactivée sur /design"),
        onOpenSettings: () => toast("Réglages : pas encore dans la phase 1"),
      }}
      quickRide={QUICK_RIDE}
      onQuickRideSubmit={(input) => {
        const bike = QUICK_RIDE.bikes.find((b) => b.id === input.bikeId);
        const duration = input.durationS ?? input.totalTimeS ?? 0;
        toast(`Sortie ajoutée à ${bike?.name ?? "ton vélo"} · ${formatDuration(duration)}`, {
          undo: () => toast("Sortie supprimée"),
        });
      }}
    >
      <nav
        aria-label="Écrans du design system"
        className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-2 px-4 py-1.5 text-[13px] md:px-6"
      >
        <span className="mr-2 shrink-0 eyebrow">Design · données fictives</span>
        {SCREENS.map((screen) => {
          const current = screen.href === pathname;
          return (
            <Link
              key={screen.href}
              href={screen.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap text-fg-muted hover:bg-surface hover:text-fg",
                current && "bg-surface font-semibold text-fg shadow-(--shadow-sm)",
              )}
            >
              {screen.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </AppShell>
  );
}
