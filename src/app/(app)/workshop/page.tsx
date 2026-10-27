import type { Metadata } from "next";
import { COMPONENT_TYPE_CODES } from "@/lib/enums";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import { requireAccessContext } from "@/server/auth/context";
import { today } from "@/server/time";
import { bikeRef } from "@/server/views/refs";
import { loadGarage } from "@/server/views/workshop";
import { WorkshopView } from "./workshop-view";

export const metadata: Metadata = { title: "Atelier · Bike-Book" };

/** Atelier (feature 8): parts and restocking; `?tab=rebuy`, `?bike=`, `?item=` keep the view. */
export default async function WorkshopPage({ searchParams }: PageProps<"/workshop">) {
  const garage = loadGarage(await requireAccessContext());
  const params = await searchParams;
  const number = (value: unknown) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  return (
    <WorkshopView
      vm={{ today: today(), bikes: garage.ridable.map(bikeRef), items: garage.items }}
      componentTypes={COMPONENT_TYPE_CODES.map((code) => ({
        code,
        label: COMPONENT_TYPE_LABELS[code],
      }))}
      initial={{
        tab: params.tab === "rebuy" ? "rebuy" : "parts",
        bikeId: number(params.bike),
        itemId: number(params.item),
      }}
    />
  );
}
