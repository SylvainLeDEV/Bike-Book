"use client";

import { useRouter } from "next/navigation";
import { ActivityScreen } from "@/components/activity/activity-screen";
import { PendingActivities } from "@/components/activity/pending-activities";
import { useTaskSheet } from "@/components/plan/task-sheet";
import { useQuickRide } from "@/components/rides/quick-ride";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { ActivityVM, PendingActivitiesVM, TimelineEdits } from "@/lib/view-models";
import {
  ignorePendingActivityAction,
  importPendingActivityAction,
  linkPendingActivityAction,
  restoreIgnoredActivityAction,
} from "@/server/actions/garmin";

export function ActivityView({
  vm,
  edits,
  pending,
}: {
  vm: ActivityVM;
  edits: TimelineEdits;
  pending: PendingActivitiesVM;
}) {
  const quickRide = useQuickRide();
  const taskSheet = useTaskSheet();
  const router = useRouter();
  return (
    <>
      <Topbar />
      <PageBody>
        <ActivityScreen
          vm={vm}
          onAddRide={() => quickRide.open()}
          inbox={
            <PendingActivities
              vm={pending}
              today={vm.today}
              onImport={importPendingActivityAction}
              onLink={linkPendingActivityAction}
              onIgnore={ignorePendingActivityAction}
              onRestore={restoreIgnoredActivityAction}
            />
          }
          onEdit={(item) => {
            if (item.kind === "ride") {
              const ride = edits.rides[item.id];
              if (ride) quickRide.edit(item.id, ride);
              return;
            }
            if (item.kind === "task") {
              const task = edits.tasks[item.id];
              if (task) taskSheet.edit(task);
              return;
            }
            // A maintenance event is edited on its bike's page, where its parts and rules are.
            const bikeId = edits.eventBikeIds[item.id];
            if (bikeId != null) router.push(`/bikes/${bikeId}?event=${item.id}`);
          }}
        />
      </PageBody>
    </>
  );
}
