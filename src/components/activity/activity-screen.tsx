"use client";

import type * as React from "react";
import { Activity, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FilteredHistory, useHistoryFilter } from "@/components/history-filters";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { NO_HISTORY_FILTER, type HistoryFilter } from "@/lib/history-filter";
import type { ActivityVM, TimelineItemVM } from "@/lib/view-models";

/**
 * "Activité": the rides, maintenance and done tasks of every bike (D-77), by month, newest
 * first, with the history's filters: a search, a bike, a period, kinds (D-78, D-112). `onEdit`
 * makes each entry open its edit sheet (D-70).
 */
export function ActivityScreen({
  vm,
  initialFilter = NO_HISTORY_FILTER,
  onAddRide,
  onEdit,
  inbox,
}: {
  vm: ActivityVM;
  /** From the address (`?q=`, `?bike=`, `?year=`…). */
  initialFilter?: HistoryFilter;
  onAddRide: () => void;
  onEdit?: (item: TimelineItemVM) => void;
  /** "À classer": Garmin activities waiting for their bike (D-101), above the timeline. */
  inbox?: React.ReactNode;
}) {
  const history = useHistoryFilter(vm.items, initialFilter);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            {formatCount(vm.rideCount, "sortie", "sorties")} ·{" "}
            {formatCount(vm.maintenanceCount, "entretien", "entretiens")}
            {vm.doneTaskCount
              ? ` · ${formatCount(vm.doneTaskCount, "tâche faite", "tâches faites")}`
              : null}
          </p>
          <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">
            Activité
          </h1>
        </div>
        <Button onClick={onAddRide}>
          <Plus />
          Ajouter une sortie
        </Button>
      </div>
      {inbox}
      {vm.items.length ? (
        <FilteredHistory
          history={history}
          today={vm.today}
          withBike
          bikes={vm.bikes}
          onEdit={onEdit}
        />
      ) : (
        <EmptyState
          art={<Activity className="!w-14" aria-hidden />}
          title="Aucune sortie pour l'instant"
          headingLevel={2}
          action={
            <Button onClick={onAddRide}>
              <Plus />
              Ajouter une sortie
            </Button>
          }
        >
          Tes sorties et tes entretiens s&apos;affichent ici, mois par mois.
        </EmptyState>
      )}
    </>
  );
}
