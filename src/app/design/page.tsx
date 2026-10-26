"use client";

import * as React from "react";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import type { PlanActions } from "@/components/plan/plan-list";
import { PageBody, Topbar } from "@/components/shell/topbar";
import { useToast } from "@/components/ui/toast";
import { DASHBOARD } from "./fixtures";
import { useDemoPlanActions } from "./demo-actions";

export default function DesignDashboardPage() {
  const { tasks, actions } = useDemoPlanActions(DASHBOARD.tasks);
  const toast = useToast();
  const planActions: PlanActions = {
    ...actions,
    onAddTask: () => toast("Nouvelle tâche : titre, vélo, échéance (fonctionnalité 7)"),
    workshopItemHref: (id) => `/design/workshop?item=${id}`,
  };
  return (
    <>
      <Topbar />
      <PageBody>
        <DashboardScreen
          vm={{ ...DASHBOARD, tasks }}
          actions={planActions}
          links={{
            bike: () => "/design/bike",
            bikes: "/design/bike",
            rebuy: "/design/workshop?tab=rebuy",
            workshopItem: (id) => `/design/workshop?item=${id}`,
            activity: "/design/activity",
          }}
        />
      </PageBody>
    </>
  );
}
