"use client";

import { Pencil } from "lucide-react";
import { BikeScreen } from "@/components/bike/bike-screen";
import { useBikeSheet } from "@/components/bike/bike-sheet";
import { Crumb, PageBody, Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import type { BikePage } from "@/server/views/bikes";

export function BikeView({ page }: { page: BikePage }) {
  const bikeSheet = useBikeSheet();
  const edit = (focus?: "status") => bikeSheet.open({ bike: page.form, focus });
  return (
    <>
      <Topbar
        start={<Crumb back={{ href: "/bikes", label: "Vélos" }} current={page.vm.bike.name} />}
        actions={
          <Button variant="ghost" size="icon" aria-label="Modifier le vélo" onClick={() => edit()}>
            <Pencil />
          </Button>
        }
      />
      <PageBody>
        <BikeScreen
          // A new bike or a renamed one starts on its first tab again.
          key={page.vm.bike.id}
          vm={page.vm}
          replace={page.replace}
          links={{
            workshopItem: () => "/workshop",
            workshopForBike: "/workshop",
            rebuyForBike: "/workshop",
          }}
          actions={{ onEditBike: edit }}
        />
      </PageBody>
    </>
  );
}
