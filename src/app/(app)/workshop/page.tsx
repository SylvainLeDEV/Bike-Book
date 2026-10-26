import type { Metadata } from "next";
import { Warehouse } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Atelier · Bike-Book" };

export default function WorkshopPage() {
  return (
    <ComingSoon
      eyebrow="Pièces et rachats"
      title="Atelier"
      art={<Warehouse className="!w-14" aria-hidden />}
    >
      Tes pièces en stock et ce qu&apos;il faut racheter arrivent dans une prochaine version.
    </ComingSoon>
  );
}
