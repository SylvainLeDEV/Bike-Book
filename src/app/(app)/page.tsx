import type { Metadata } from "next";
import { requireAccessContext } from "@/server/auth/context";
import { getDashboardVM } from "@/server/views/dashboard";
import { HomeView } from "./home-view";

export const metadata: Metadata = { title: "Accueil · Bike-Book" };

export default async function HomePage() {
  const context = await requireAccessContext();
  return <HomeView vm={getDashboardVM(context)} />;
}
