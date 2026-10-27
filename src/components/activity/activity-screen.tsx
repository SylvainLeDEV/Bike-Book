import { Activity, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import type { ActivityVM, TimelineItemVM } from "@/lib/view-models";

/**
 * "Activité": the ride and maintenance log of every bike, by month, newest first. `onEdit` makes
 * each entry open its edit sheet (D-70).
 */
export function ActivityScreen({
  vm,
  onAddRide,
  onEdit,
}: {
  vm: ActivityVM;
  onAddRide: () => void;
  onEdit?: (item: TimelineItemVM) => void;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            {formatCount(vm.rideCount, "sortie", "sorties")} ·{" "}
            {formatCount(vm.maintenanceCount, "entretien", "entretiens")}
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
      {vm.items.length ? (
        <Card padded>
          <Timeline items={vm.items} today={vm.today} withBike groupByMonth onEdit={onEdit} />
        </Card>
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
