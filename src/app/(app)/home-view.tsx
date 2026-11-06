"use client";

import { useRouter } from "next/navigation";
import { useBikeSheet } from "@/components/bike/bike-sheet";
import { useTaskSheet } from "@/components/plan/task-sheet";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import { useToast } from "@/components/ui/toast";
import type { DashboardVM } from "@/lib/view-models";
import { startRunAction } from "@/server/actions/runs";
import { useSnooze } from "./use-snooze";
import { useTaskDone } from "./use-task-done";

export function HomeView({ vm }: { vm: DashboardVM }) {
  const bikeSheet = useBikeSheet();
  const router = useRouter();
  const snooze = useSnooze(vm.today);
  const taskSheet = useTaskSheet();
  const taskDone = useTaskDone();
  const toast = useToast();
  return (
    <>
      <Topbar />
      <PageBody>
        <DashboardScreen
          vm={vm}
          actions={{
            // The maintenance sheet lives on the bike page: open it there, prefilled.
            onRuleDone: (rule) => router.push(`/bikes/${rule.bike.id}?done=${rule.id}`),
            onRuleSnooze: (rule) => snooze.open(rule),
            onRuleReactivate: (rule) => snooze.reactivate(rule),
            onTaskDone: (task) => taskDone(task.id, task.title),
            onTaskEdit: (task) => taskSheet.edit(task),
            onAddTask: () => taskSheet.open(),
            workshopItemHref: (id) => `/workshop?item=${id}`,
            onStartRule: async (rule) => {
              const result = await startRunAction({ from: "rule", ruleId: rule.id });
              if (!result.ok) return toast(result.error);
              router.push(`/runs/${result.runId}`);
            },
            onStartTask: async (task) => {
              const result = await startRunAction({ from: "task", taskId: task.id });
              if (!result.ok) return toast(result.error);
              router.push(`/runs/${result.runId}`);
            },
            runHref: (runId) => `/runs/${runId}`,
            procedureHref: (id, bikeId) =>
              `/workshop?tab=procedures&procedure=${id}${bikeId != null ? `&bike=${bikeId}` : ""}`,
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
      {snooze.sheet}
    </>
  );
}
