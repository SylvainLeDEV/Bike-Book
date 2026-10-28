"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, ImagePlus, Paperclip, Plus, Replace, ShoppingCart, Wrench } from "lucide-react";
import { UploadButton, UploadRows } from "@/components/attachments/upload-controls";
import { useUploads } from "@/components/attachments/use-uploads";
import { BikeCover } from "@/components/bike-cover";
import { FilteredHistory, useHistoryFilter } from "@/components/history-filters";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { PhotoViewerProvider } from "@/components/photos/photo-viewer";
import { PlanList, type PlanActions } from "@/components/plan/plan-list";
import { useQuickRide } from "@/components/rides/quick-ride";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoPopover } from "@/components/ui/info-popover";
import { ReplacePartSheet } from "@/components/workshop/replace-part-sheet";
import { InventoryRowContent, inventoryRowClasses } from "@/components/workshop/inventory-row";
import { formatCount, formatDate, formatInteger, formatKilometres } from "@/lib/format";
import { NO_HISTORY_FILTER, type HistoryFilter } from "@/lib/history-filter";
import { BIKE_STATUS_LABELS, DISCIPLINE_LABELS } from "@/lib/labels";
import type {
  AttachmentVM,
  BikePageVM,
  InventoryItemVM,
  ReplacePartInput,
  ReplacePartVM,
  TimelineItemVM,
} from "@/lib/view-models";
import { BikeRecord, BIKE_STATUS_ICONS } from "./bike-record";
import {
  BikeOverview,
  BikeTabExtra,
  BikeTabList,
  BikeTabPanel,
  BikeTabs,
  useBikeTabs,
  type BikeTabId,
} from "./bike-tabs";
import { ComponentsSection } from "./components-section";

export type BikeScreenActions = PlanActions & {
  onReplacePart?: (
    input: ReplacePartInput,
    item: InventoryItemVM | null,
  ) => void | Promise<void | { ok: false; error: string }>;
  onAddComponent?: () => void;
  onEditComponent?: (componentId: number) => void;
  onAddMaintenance?: () => void;
  onEditBike?: (focus?: "status") => void;
  onShowWearDetail?: () => void;
  onShowRules?: () => void;
  /** Opens an entry of the history in its edit sheet (D-70). */
  onEditHistoryItem?: (item: TimelineItemVM) => void;
};

export type BikeScreenLinks = {
  workshopItem: (itemId: number) => string;
  /** The workshop filtered on this bike. */
  workshopForBike: string;
  /** "À racheter", filtered on this bike. */
  rebuyForBike: string;
};

function SectionHead({
  id,
  title,
  side,
}: {
  id: string;
  title: React.ReactNode;
  side?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2
        id={id}
        tabIndex={-1}
        className="text-[17px] font-semibold tracking-[-0.01em] outline-none"
      >
        {title}
      </h2>
      {side}
    </div>
  );
}

function Stat({
  value,
  unit,
  label,
  info,
}: {
  value: string;
  unit?: string;
  label: string;
  info?: React.ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="num text-[30px] leading-none font-bold">
        {value}
        {unit ? (
          <small className="ml-[3px] text-[17px] font-medium text-fg-muted">{unit}</small>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[13px] text-fg-muted">
        {label}
        {info}
      </div>
    </div>
  );
}

/** Entries of "Dernières entrées", above the record or under "À prévoir" (D-78). */
const RECENT_COUNT = 5;

/**
 * Bike page (D-43, D-48, D-78): counters, "À prévoir" and the latest entries, components, stock,
 * record, photos, and the history with its filters in a tab of its own.
 */
export function BikeScreen({
  vm,
  replace,
  actions,
  links,
  initialReplaceItemId,
  initialTab,
  initialHistoryFilter,
}: {
  vm: BikePageVM;
  replace: ReplacePartVM;
  actions: BikeScreenActions;
  links: BikeScreenLinks;
  /** "Monter sur …" from the workshop: the replace sheet opens with this item chosen. */
  initialReplaceItemId?: number | null;
  /** `?tab=` on arrival. */
  initialTab?: BikeTabId;
  /** `?year=`, `?month=`, `?kind=` on arrival. */
  initialHistoryFilter?: HistoryFilter;
}) {
  return (
    <BikeTabs initial={initialTab}>
      <BikeScreenContent
        vm={vm}
        replace={replace}
        actions={actions}
        links={links}
        initialReplaceItemId={initialReplaceItemId ?? null}
        initialHistoryFilter={initialHistoryFilter ?? NO_HISTORY_FILTER}
      />
    </BikeTabs>
  );
}

function BikeScreenContent({
  vm,
  replace,
  actions,
  links,
  initialReplaceItemId,
  initialHistoryFilter,
}: {
  vm: BikePageVM;
  replace: ReplacePartVM;
  actions: BikeScreenActions;
  links: BikeScreenLinks;
  initialReplaceItemId: number | null;
  initialHistoryFilter: HistoryFilter;
}) {
  const tabs = useBikeTabs();
  const { open: openQuickRide } = useQuickRide();
  const [replaceOpen, setReplaceOpen] = React.useState(initialReplaceItemId != null);
  const history = useHistoryFilter(vm.history, initialHistoryFilter);
  const { bike, stats } = vm;
  const StatusIcon = BIKE_STATUS_ICONS[bike.status];

  // Uploads of the bike itself (feature 10): cover, gallery, record documents.
  const bikeOwner = React.useMemo(() => ({ kind: "bike" as const, id: bike.id }), [bike.id]);
  const coverUploads = useUploads(bikeOwner);
  const photoUploads = useUploads(bikeOwner);
  const documentUploads = useUploads(bikeOwner);

  // "Voir dans l'historique" from the viewer: open the right tab, then focus the element (shown
  // even when the filters or "Voir plus" hid it).
  const showOrigin = (photo: AttachmentVM) => {
    const { kind, id } = photo.origin;
    if (kind === "task" || kind === "inventory_item") return;
    const tab = kind === "bike" ? "record" : kind === "component" ? "components" : "history";
    if (kind === "ride" || kind === "maintenance_event")
      history.reveal(kind === "ride" ? "ride" : "maintenance", id);
    tabs?.select(tab);
    const target =
      kind === "bike"
        ? "bike-record-title"
        : kind === "component"
          ? "bike-components-title"
          : `${kind === "ride" ? "ride" : "maintenance"}-${id}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(target);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center" });
    });
  };

  return (
    <PhotoViewerProvider onShowOrigin={showOrigin}>
      <BikeCover
        cover={bike.cover}
        className="-mx-4 -mt-4 aspect-[16/10] md:mx-0 md:mt-0 md:aspect-[3/1] md:rounded-card"
      >
        <span className="absolute inset-0 bg-[linear-gradient(to_top,var(--photo-shade),transparent_62%)]" />
        {coverUploads.enabled ? (
          <UploadButton
            single
            variant="secondary"
            onFiles={(files) => coverUploads.add(files, true)}
            className="absolute top-3 right-3 h-[34px] gap-1.5 rounded-full border-0 bg-photo-glass px-3 text-[13px] leading-none text-on-photo shadow-none backdrop-blur-md hover:bg-photo-glass pointer-coarse:h-11"
          >
            <Camera className="size-4" aria-hidden />
            {bike.cover.photoUrl ? "Changer la photo" : "Ajouter une photo"}
          </UploadButton>
        ) : null}
        <div className="absolute inset-x-4 bottom-3.5 text-on-photo md:bottom-5 md:left-6">
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex h-6 items-center rounded-full bg-photo-glass px-[9px] text-xs leading-none font-semibold backdrop-blur-md">
              {DISCIPLINE_LABELS[bike.discipline]}
              {bike.isElectric ? " · électrique" : ""}
            </span>
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-photo-glass px-[9px] text-xs leading-none font-semibold backdrop-blur-md">
              <StatusIcon className="size-[13px]" aria-hidden />
              {BIKE_STATUS_LABELS[bike.status]}
            </span>
          </div>
          <h1 className="mt-2 mb-1 num text-[40px] leading-none font-bold tracking-[0.005em] md:text-5xl">
            {bike.name}
          </h1>
          <p className="text-sm opacity-90">
            {[
              [bike.brand, bike.model].filter(Boolean).join(" "),
              bike.modelYear,
              bike.frameSize ? `taille ${bike.frameSize}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </BikeCover>

      <UploadRows rows={coverUploads.rows} onDismiss={coverUploads.dismiss} className="mt-3" />
      <div className="my-4 flex flex-wrap gap-2">
        <Button onClick={() => openQuickRide(bike.id)}>
          <Plus />
          Ajouter une sortie
        </Button>
        <Button
          variant="secondary"
          onClick={actions.onAddMaintenance}
          disabled={!actions.onAddMaintenance}
        >
          <Wrench />
          Entretien
        </Button>
        <Button
          variant="secondary"
          onClick={() => setReplaceOpen(true)}
          disabled={!replace.slots.length}
        >
          <Replace />
          Remplacer une pièce
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4">
        <Stat value={formatKilometres(stats.distanceM)} unit="km" label="Distance totale" />
        <Stat
          value={formatInteger(stats.wearS / 3600)}
          unit="h"
          label="Heures d'usure"
          info={
            <InfoPopover label="Comment sont calculées les heures d'usure">
              Une sortie compte son temps en mouvement, sinon son temps total. Avec remontées
              mécaniques, seul le temps de descente compte quand il est saisi.
            </InfoPopover>
          }
        />
        <Stat value={formatInteger(stats.rideCount)} label="Sorties" />
        <Stat
          value={
            stats.daysSinceLastMaintenance != null
              ? formatInteger(stats.daysSinceLastMaintenance)
              : "–"
          }
          unit={stats.daysSinceLastMaintenance != null ? "j" : undefined}
          label="Depuis le dernier entretien"
        />
      </div>
      <p className="mt-2 text-[13px] text-fg-muted">
        Calculé sur {formatCount(stats.rideCount, "sortie", "sorties")} depuis le{" "}
        {formatDate(stats.trackedSince, { year: "always" })}.{" "}
        {actions.onShowWearDetail ? (
          <Button variant="link" className="text-[13px]" onClick={actions.onShowWearDetail}>
            Voir le détail
          </Button>
        ) : null}
      </p>

      <BikeTabList />

      <BikeOverview className="grid gap-[26px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-x-7">
        <div className="contents lg:grid lg:min-w-0 lg:gap-[26px]">
          <BikeTabPanel tab="plan">
            <section aria-labelledby="bike-plan-title">
              <SectionHead
                id="bike-plan-title"
                title="À prévoir"
                side={
                  actions.onShowRules ? (
                    <Button variant="link" onClick={actions.onShowRules}>
                      Règles
                    </Button>
                  ) : null
                }
              />
              <PlanList
                rules={vm.rules}
                tasks={vm.tasks}
                today={vm.today}
                withBike={false}
                actions={actions}
              />
            </section>
          </BikeTabPanel>

          <BikeTabPanel tab="components">
            <ComponentsSection
              groups={vm.components.groups}
              purchasedOn={vm.components.purchasedOn}
              today={vm.today}
              onAdd={actions.onAddComponent}
              onEdit={actions.onEditComponent}
            />
            <section aria-labelledby="bike-stock-title">
              <SectionHead
                id="bike-stock-title"
                title="En stock pour ce vélo"
                side={
                  vm.stock.total ? (
                    <Button variant="link" asChild>
                      <Link href={links.workshopForBike}>Tout voir ({vm.stock.total})</Link>
                    </Button>
                  ) : null
                }
              />
              <Card asChild className="overflow-hidden">
                <ul className="m-0 list-none divide-y divide-border p-0">
                  {vm.stock.rows.map((row) => (
                    <li key={row.id}>
                      <Link href={links.workshopItem(row.id)} className={inventoryRowClasses}>
                        <InventoryRowContent row={row} allBikes={[]} showLocation />
                      </Link>
                    </li>
                  ))}
                  {vm.stock.rows.length ? null : (
                    <li className="px-4 py-3 text-[13px] text-fg-muted">
                      Rien en stock pour ce vélo.
                    </li>
                  )}
                  {vm.stock.toRebuy ? (
                    <li className="px-2 py-1.5">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={links.rebuyForBike}>
                          <ShoppingCart />
                          {vm.stock.toRebuy} objet{vm.stock.toRebuy > 1 ? "s" : ""} à racheter pour
                          ce vélo
                        </Link>
                      </Button>
                    </li>
                  ) : null}
                </ul>
              </Card>
            </section>
          </BikeTabPanel>

          <BikeTabPanel tab="photos">
            <section aria-labelledby="bike-photos-title">
              <SectionHead
                id="bike-photos-title"
                title={
                  <>
                    Photos
                    {vm.photos.length ? (
                      <span className="ml-1.5 num text-[15px] leading-none font-semibold text-fg-muted">
                        {vm.photos.length}
                      </span>
                    ) : null}
                  </>
                }
                side={
                  vm.photos.length && photoUploads.enabled ? (
                    <UploadButton
                      variant="secondary"
                      size="sm"
                      onFiles={(files) => photoUploads.add(files)}
                    >
                      <Camera />
                      Ajouter
                    </UploadButton>
                  ) : null
                }
              />
              <UploadRows
                rows={photoUploads.rows}
                onDismiss={photoUploads.dismiss}
                className="mb-3"
              />
              <PhotoGallery
                bikeName={bike.name}
                photos={vm.photos}
                onAddFiles={photoUploads.enabled ? (files) => photoUploads.add(files) : undefined}
              />
            </section>
          </BikeTabPanel>
        </div>

        <div className="contents lg:grid lg:min-w-0 lg:gap-[26px]">
          <BikeTabExtra tab="plan" id="bike-recent">
            <section aria-labelledby="bike-recent-title">
              <SectionHead
                id="bike-recent-title"
                title="Dernières entrées"
                side={
                  vm.history.length ? (
                    <Button
                      variant="link"
                      onClick={() => {
                        tabs?.select("history");
                        requestAnimationFrame(() =>
                          document
                            .getElementById("bike-history-title")
                            ?.focus({ preventScroll: true }),
                        );
                      }}
                    >
                      Tout l&apos;historique ({vm.history.length})
                    </Button>
                  ) : null
                }
              />
              <Card padded>
                <Timeline
                  items={vm.history.slice(0, RECENT_COUNT)}
                  today={vm.today}
                  relativeDates
                  compact
                  onEdit={actions.onEditHistoryItem}
                />
              </Card>
            </section>
          </BikeTabExtra>

          <BikeTabPanel tab="record">
            <section aria-labelledby="bike-record-title">
              <SectionHead
                id="bike-record-title"
                title="Fiche du vélo"
                side={
                  actions.onEditBike ? (
                    <Button variant="secondary" size="sm" onClick={() => actions.onEditBike?.()}>
                      Modifier
                    </Button>
                  ) : null
                }
              />
              <BikeRecord
                record={vm.record}
                today={vm.today}
                documentAction={
                  documentUploads.enabled ? (
                    <div className="mt-1 grid gap-2">
                      <UploadRows rows={documentUploads.rows} onDismiss={documentUploads.dismiss} />
                      <div>
                        <UploadButton
                          variant="ghost"
                          size="sm"
                          onFiles={(files) => documentUploads.add(files)}
                        >
                          <Paperclip />
                          Joindre un document
                        </UploadButton>
                      </div>
                    </div>
                  ) : undefined
                }
                statusAction={
                  actions.onEditBike ? (
                    <Button variant="link" onClick={() => actions.onEditBike?.("status")}>
                      Changer
                    </Button>
                  ) : undefined
                }
              />
            </section>
          </BikeTabPanel>
        </div>
      </BikeOverview>

      <BikeTabPanel tab="history">
        <section aria-labelledby="bike-history-title">
          <SectionHead
            id="bike-history-title"
            title="Historique"
            side={<span className="hint">Sorties, entretiens et tâches faites</span>}
          />
          <FilteredHistory
            history={history}
            today={vm.today}
            onEdit={actions.onEditHistoryItem}
            addPhotos={
              photoUploads.enabled
                ? (item) => <EntryUpload key={`${item.kind}-${item.id}`} item={item} />
                : undefined
            }
          />
        </section>
      </BikeTabPanel>

      <ReplacePartSheet
        vm={replace}
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        initialItemId={initialReplaceItemId}
        onSubmit={async (input, item) => actions.onReplacePart?.(input, item)}
      />
    </PhotoViewerProvider>
  );
}

/** "Photos" on a history entry: photos (or an invoice) of that ride, maintenance event or task. */
function EntryUpload({ item }: { item: TimelineItemVM }) {
  const owner = React.useMemo(
    () => ({
      kind: item.kind === "maintenance" ? ("maintenance_event" as const) : item.kind,
      id: item.id,
    }),
    [item.kind, item.id],
  );
  const uploads = useUploads(owner);
  return (
    <>
      <UploadButton
        variant="secondary"
        size="sm"
        className="h-8 rounded-full border-dashed px-3 font-medium text-fg-muted shadow-none"
        aria-label={`Ajouter des photos ou un document à « ${item.title} »`}
        onFiles={(files) => uploads.add(files)}
      >
        <ImagePlus />
        {item.photos.length ? null : "Photos"}
      </UploadButton>
      <UploadRows rows={uploads.rows} onDismiss={uploads.dismiss} className="basis-full" />
    </>
  );
}
