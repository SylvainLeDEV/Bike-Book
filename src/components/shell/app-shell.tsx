"use client";

import { QuickRideProvider } from "@/components/rides/quick-ride";
import type { EditResult, QuickRideInput, QuickRideVM } from "@/lib/view-models";
import { BottomNav, Sidebar } from "./nav";
import { ShellProvider, type ShellValue } from "./shell-context";

/**
 * The signed-in layout (D-30): bottom tab bar under 700 px, icon rail from 700 to 1023 px, full
 * sidebar from 1024 px. Each page renders its own <Topbar> and <PageBody>; the document scrolls.
 * Must sit inside a <ToastProvider>.
 */
export function AppShell({
  shell,
  quickRide,
  onQuickRideSubmit,
  onRideUpdate,
  onRideDelete,
  children,
}: {
  shell: ShellValue;
  quickRide: QuickRideVM;
  onQuickRideSubmit: (input: QuickRideInput) => void | Promise<void | { ok: false; error: string }>;
  /** "Modifier la sortie" and "Supprimer la sortie" (D-70); not offered without them. */
  onRideUpdate?: (rideId: number, input: QuickRideInput) => Promise<EditResult>;
  onRideDelete?: (rideId: number) => Promise<EditResult>;
  children: React.ReactNode;
}) {
  return (
    <ShellProvider value={shell}>
      <QuickRideProvider
        vm={quickRide}
        onSubmit={onQuickRideSubmit}
        onUpdate={onRideUpdate}
        onDelete={onRideDelete}
      >
        <div className="flex min-h-dvh flex-1 md:grid md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
        </div>
        <BottomNav />
      </QuickRideProvider>
    </ShellProvider>
  );
}
