import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Activité · Bike-Book" };

export default function ActivityPage() {
  return (
    <ComingSoon
      eyebrow="Sorties et entretiens"
      title="Activité"
      art={<Activity className="!w-14" aria-hidden />}
    >
      Le journal de tes sorties et de tes entretiens arrive avec leur saisie.
    </ComingSoon>
  );
}
