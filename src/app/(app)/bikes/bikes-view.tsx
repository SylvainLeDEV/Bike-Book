"use client";

import { useBikeSheet } from "@/components/bike/bike-sheet";
import { BikesScreen } from "@/components/bike/bikes-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { BikesPageVM } from "@/lib/view-models";

export function BikesView({ vm }: { vm: BikesPageVM }) {
  const bikeSheet = useBikeSheet();
  return (
    <>
      <Topbar />
      <PageBody>
        <BikesScreen vm={vm} bikeHref={(id) => `/bikes/${id}`} onAddBike={() => bikeSheet.open()} />
      </PageBody>
    </>
  );
}
