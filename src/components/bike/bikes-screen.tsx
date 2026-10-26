import { ChevronRight, Plus } from "lucide-react";
import { BikeLine } from "@/components/bike-cover";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import type { BikesPageVM } from "@/lib/view-models";
import { BikeCard } from "./bike-card";

const grid = "grid gap-3 md:grid-cols-2 lg:grid-cols-3";

/** "Vélos": active bikes as cards; stored, sold, stolen and retired ones folded below. */
export function BikesScreen({
  vm,
  bikeHref,
  onAddBike,
}: {
  vm: BikesPageVM;
  bikeHref: (bikeId: number) => string;
  onAddBike: () => void;
}) {
  const total = vm.active.length + vm.others.length;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{formatCount(total, "vélo", "vélos")}</p>
          <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">Vélos</h1>
        </div>
        {total ? (
          <Button onClick={onAddBike}>
            <Plus />
            Ajouter un vélo
          </Button>
        ) : null}
      </div>

      {total === 0 ? (
        <EmptyState
          art={<BikeLine />}
          title="Aucun vélo pour l'instant"
          headingLevel={2}
          action={
            <Button onClick={onAddBike}>
              <Plus />
              Ajouter un vélo
            </Button>
          }
        >
          Ajoute ton premier vélo : ses sorties, son entretien et ses pièces suivront.
        </EmptyState>
      ) : null}

      {vm.active.length ? (
        <ul className={`m-0 list-none p-0 ${grid}`}>
          {vm.active.map((card) => (
            <li key={card.bike.id}>
              <BikeCard card={card} href={bikeHref(card.bike.id)} />
            </li>
          ))}
        </ul>
      ) : total ? (
        <p className="text-sm text-fg-muted">Aucun vélo actif.</p>
      ) : null}

      {vm.others.length ? (
        <details className="group mt-6">
          <summary className="flex min-h-11 list-none items-center gap-2 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-[18px] transition-transform group-open:rotate-90"
              aria-hidden
            />
            Rangés, vendus, volés ou retirés
            <span className="num text-[15px] leading-none font-semibold text-fg-muted">
              {vm.others.length}
            </span>
          </summary>
          <ul className={`m-0 mt-2 list-none p-0 ${grid}`}>
            {vm.others.map((card) => (
              <li key={card.bike.id}>
                <BikeCard card={card} href={bikeHref(card.bike.id)} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
