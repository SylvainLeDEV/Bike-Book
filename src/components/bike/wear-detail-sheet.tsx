"use client";

import { CableCar } from "lucide-react";
import { Sheet, SheetBody, SheetContent } from "@/components/ui/sheet";
import { formatCount, formatDate, formatDistance, formatDuration } from "@/lib/format";
import type { WearDetailVM } from "@/lib/view-models";

/** "Voir le détail": the rides behind the bike's counters, and the wear each one adds (D-13). */
export function WearDetailSheet({
  open,
  onOpenChange,
  bikeName,
  vm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikeName: string;
  vm: WearDetailVM;
}) {
  const distance = vm.rides.reduce((sum, ride) => sum + ride.distanceM, vm.initialDistanceM);
  const wear = vm.rides.reduce((sum, ride) => sum + ride.wearS, vm.initialWearS);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Détail des compteurs" description={bikeName}>
        <SheetBody>
          <p className="text-sm text-fg-muted">
            {formatCount(vm.rides.length, "sortie", "sorties")} :{" "}
            <b className="text-fg">{formatDistance(distance)}</b> et{" "}
            <b className="text-fg">{formatDuration(wear)}</b> d&apos;usure
            {vm.initialDistanceM || vm.initialWearS
              ? `, dont ${formatDistance(vm.initialDistanceM)} et ${formatDuration(vm.initialWearS)} avant le suivi`
              : ""}
            . Une sortie compte son temps en mouvement, sinon son temps total ; avec remontées, seul
            le temps de descente compte quand il est saisi.
          </p>
          <ol className="m-0 list-none divide-y divide-border p-0">
            {vm.rides.map((ride) => (
              <li key={ride.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold">{ride.title}</span>
                  <span className="block text-[13px] text-fg-muted">
                    {formatDate(ride.on, { month: "short" })}
                    {ride.liftCounting ? (
                      <>
                        {" · "}
                        <CableCar className="inline size-3.5 align-[-2px]" aria-hidden />{" "}
                        {ride.liftCounting === "descent"
                          ? "temps de descente"
                          : "sans temps de descente : temps total"}
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 text-right num text-[15px] font-semibold">
                  {formatDistance(ride.distanceM)} · {formatDuration(ride.wearS)}
                </span>
              </li>
            ))}
          </ol>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
