"use client";

import { useBikeSheet } from "@/components/bike/bike-sheet";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { DashboardVM } from "@/lib/view-models";

export function HomeView({ vm }: { vm: DashboardVM }) {
  const bikeSheet = useBikeSheet();
  return (
    <>
      <Topbar />
      <PageBody>
        <DashboardScreen
          vm={vm}
          actions={{}}
          links={{
            bike: (id) => `/bikes/${id}`,
            bikes: "/bikes",
            rebuy: "/workshop",
            workshopItem: () => "/workshop",
            activity: "/activity",
          }}
          onAddBike={() => bikeSheet.open()}
        />
      </PageBody>
    </>
  );
}
