"use client";

import { useRouter } from "next/navigation";
import { useBikeSheet } from "@/components/bike/bike-sheet";
import { useTaskSheet } from "@/components/plan/task-sheet";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { DashboardVM } from "@/lib/view-models";
import { snoozeRuleAction, undoSnoozeAction } from "@/server/actions/rules";
import { useSnooze } from "./use-snooze";
import { useTaskDone } from "./use-task-done";

export function HomeView({ vm }: { vm: DashboardVM }) {
  const bikeSheet = useBikeSheet();
  const router = useRouter();
  const snooze = useSnooze(snoozeRuleAction, undoSnoozeAction);
  const taskSheet = useTaskSheet();
  const taskDone = useTaskDone();
  return (
    <>
      <Topbar />
      <PageBody>
        <DashboardScreen
          vm={vm}
          actions={{
            // The maintenance sheet lives on the bike page: open it there, prefilled.
            onRuleDone: (rule) => router.push(`/bikes/${rule.bike.id}?done=${rule.id}`),
            onRuleSnooze: (rule) => snooze(rule.id, rule.title),
            onTaskDone: (task) => taskDone(task.id, task.title),
            onAddTask: () => taskSheet.open(),
            workshopItemHref: (id) => `/workshop?item=${id}`,
          }}
          links={{
            bike: (id) => `/bikes/${id}`,
            bikes: "/bikes",
            rebuy: "/workshop?tab=rebuy",
            workshopItem: (id) => `/workshop?item=${id}`,
            activity: "/activity",
          }}
          onAddBike={() => bikeSheet.open()}
        />
      </PageBody>
    </>
  );
}
