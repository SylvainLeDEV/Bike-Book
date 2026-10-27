"use client";

import { ActivityScreen } from "@/components/activity/activity-screen";
import { useQuickRide } from "@/components/rides/quick-ride";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { ActivityVM } from "@/lib/view-models";

export function ActivityView({ vm }: { vm: ActivityVM }) {
  const quickRide = useQuickRide();
  return (
    <>
      <Topbar />
      <PageBody>
        <ActivityScreen vm={vm} onAddRide={() => quickRide.open()} />
      </PageBody>
    </>
  );
}
