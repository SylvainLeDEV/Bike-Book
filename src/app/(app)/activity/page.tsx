import type { Metadata } from "next";
import { parseHistoryFilter } from "@/lib/history-filter";
import { requireAccessContext } from "@/server/auth/context";
import { getActivityPage } from "@/server/views/activity";
import { pendingActivitiesView } from "@/server/views/garmin";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activité · Bike-Book" };

// The history's ?q=, ?bike=, ?year=, ?month=, ?kind= keep the view (D-78, D-112).
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const context = await requireAccessContext();
  const { vm, edits } = getActivityPage(context);
  return (
    <ActivityView
      vm={vm}
      edits={edits}
      pending={pendingActivitiesView(context)}
      historyFilter={parseHistoryFilter(await searchParams)}
    />
  );
}
