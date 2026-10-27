import type { Metadata } from "next";
import { requireAccessContext } from "@/server/auth/context";
import { getActivityVM } from "@/server/views/activity";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activité · Bike-Book" };

export default async function ActivityPage() {
  const context = await requireAccessContext();
  return <ActivityView vm={getActivityVM(context)} />;
}
