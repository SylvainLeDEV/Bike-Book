import type { Metadata } from "next";
import { requireAccessContext } from "@/server/auth/context";
import { getBikesPageVM } from "@/server/views/bikes";
import { BikesView } from "./bikes-view";

export const metadata: Metadata = { title: "Vélos · Bike-Book" };

export default async function BikesPage() {
  const context = await requireAccessContext();
  return <BikesView vm={getBikesPageVM(context)} />;
}
