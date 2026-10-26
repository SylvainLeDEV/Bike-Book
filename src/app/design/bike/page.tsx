"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { BikeScreen } from "@/components/bike/bike-screen";
import { Crumb, PageBody, Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatStock } from "@/lib/display";
import type { PhotoVM } from "@/lib/view-models";
import { useDemoPlanActions } from "../demo-actions";
import { REPLACE_ON_SPECTRAL, SPECTRAL_PAGE } from "../fixtures";

export default function DesignBikePage() {
  const toast = useToast();
  const { tasks, actions: planActions } = useDemoPlanActions(SPECTRAL_PAGE.tasks);
  const [photos, setPhotos] = React.useState<PhotoVM[]>(SPECTRAL_PAGE.photos);
  const later = (what: string) => () => toast(`${what} : arrive avec la phase 1, étape B`);

  return (
    <>
      <Topbar
        start={
          <Crumb back={{ href: "/design", label: "Vélos" }} current={SPECTRAL_PAGE.bike.name} />
        }
        actions={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Modifier le vélo"
            onClick={later("Modifier le vélo")}
          >
            <Pencil />
          </Button>
        }
      />
      <PageBody>
        <BikeScreen
          vm={{ ...SPECTRAL_PAGE, tasks, photos }}
          replace={REPLACE_ON_SPECTRAL}
          links={{
            workshopItem: (id) => `/design/workshop?item=${id}`,
            workshopForBike: "/design/workshop?bike=1",
            rebuyForBike: "/design/workshop?tab=rebuy&bike=1",
          }}
          actions={{
            ...planActions,
            onAddTask: later("Nouvelle tâche"),
            workshopItemHref: (id) => `/design/workshop?item=${id}`,
            onShowRules: later("Règles du vélo"),
            onShowWearDetail: later("Détail des sorties comptées"),
            onChangeCover: later("Changer la photo"),
            onAddMaintenance: later("Saisie d'un entretien"),
            onEditBike: later("Modifier le vélo"),
            onAddPhotos: later("Ajout de photos"),
            onAttachDocument: later("Joindre un document"),
            onSetCover: () => toast("Photo principale du vélo changée"),
            onCaptionSave: () => toast("Légende enregistrée"),
            onDelete: (photo) => {
              const index = photos.findIndex((p) => p.id === photo.id);
              setPhotos((list) => list.filter((p) => p.id !== photo.id));
              toast("Photo supprimée", {
                undo: () => {
                  setPhotos((list) => [...list.slice(0, index), photo, ...list.slice(index)]);
                  toast("Photo restaurée");
                },
              });
            },
            onReplacePart: (input, item) => {
              const slot = REPLACE_ON_SPECTRAL.slots.find(
                (s) => s.componentId === input.removedComponentId,
              );
              const label = `${slot?.label ?? "Pièce"} remplacée`;
              toast(
                item
                  ? `${label} · stock : ${formatStock(item.quantity - 1, item.unit)}`
                  : `${label} · pièce saisie à la main`,
                { undo: () => toast("Remplacement annulé") },
              );
            },
          }}
        />
      </PageBody>
    </>
  );
}
