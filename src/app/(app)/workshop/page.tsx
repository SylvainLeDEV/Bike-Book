import type { Metadata } from "next";
import { COMPONENT_TYPE_CODES } from "@/lib/enums";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import { requireAccessContext } from "@/server/auth/context";
import { today } from "@/server/time";
import { bikeRef } from "@/server/views/refs";
import { parseWorkshopView } from "@/lib/workshop-filter";
import { loadGarage } from "@/server/views/workshop";
import { WorkshopView } from "./workshop-view";

export const metadata: Metadata = { title: "Atelier · Bike-Book" };

/**
 * Atelier (feature 8, D-85): parts, products, tools and restocking. `?tab=`, `?bike=`, `?q=` and
 * `?item=` keep the view, rewritten in place by the screen.
 */
export default async function WorkshopPage({ searchParams }: PageProps<"/workshop">) {
  const garage = loadGarage(await requireAccessContext());
  const params = await searchParams;
  return (
    <WorkshopView
      vm={{ today: today(), bikes: garage.ridable.map(bikeRef), items: garage.items }}
      componentTypes={COMPONENT_TYPE_CODES.map((code) => ({
        code,
        label: COMPONENT_TYPE_LABELS[code],
      }))}
      initial={parseWorkshopView(params)}
    />
  );
}
