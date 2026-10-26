import { Activity } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageBody, Topbar } from "@/components/shell/topbar";

/** Activité is not in the mockup: the ride and maintenance log come with features 4 and 5. */
export default function DesignActivityPage() {
  return (
    <>
      <Topbar />
      <PageBody>
        <div className="mb-4">
          <p className="eyebrow">Sorties et entretiens</p>
          <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">
            Activité
          </h1>
        </div>
        <EmptyState
          art={<Activity className="!w-14" aria-hidden />}
          title="Écran pas encore maquetté"
        >
          Le journal des sorties et des entretiens arrive avec les fonctionnalités 4 et 5 de la
          phase 1. Il réutilisera la chronologie de la page vélo.
        </EmptyState>
      </PageBody>
    </>
  );
}
