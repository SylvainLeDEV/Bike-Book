"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import { originLabel } from "@/components/attachments/origin";
import { UploadButton } from "@/components/attachments/upload-controls";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { formatDate, formatMonthYear } from "@/lib/format";
import type { PhotoOrigin, PhotoVM } from "@/lib/view-models";
import { usePhotoViewer } from "./photo-viewer";

const ORIGIN_FILTERS: [PhotoOrigin | "", string][] = [
  ["", "Toutes origines"],
  ["bike", "Vélo"],
  ["component", "Composants"],
  ["maintenance_event", "Entretiens"],
  ["ride", "Sorties"],
  ["task", "Tâches"],
];

const CAMERA_ART = (
  <svg viewBox="0 0 120 70" aria-hidden focusable="false">
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="22" y="16" width="76" height="48" rx="8" />
      <path d="M44 16 L50 8 H70 L76 16" />
      <circle cx="60" cy="40" r="14" />
      <circle cx="60" cy="40" r="6" />
      <path d="M86 26 H90" />
    </g>
  </svg>
);

function tileLabel(photo: PhotoVM): string {
  const where =
    photo.origin.kind === "bike"
      ? "photo du vélo"
      : photo.origin.kind === "component"
        ? `composant : ${photo.origin.title}`
        : `${originLabel(photo)} : ${photo.origin.title}`;
  // Photos of a general task or the workshop never reach a bike's gallery.
  return `${photo.caption ?? photo.alt}. ${where}, ${formatDate(photo.takenOn)}`;
}

/**
 * One gallery per bike (D-45): photos of the bike, its components, maintenance and rides,
 * grouped by month, newest first. No labels in phase 1. Thumbnails open the viewer.
 */
export function PhotoGallery({
  bikeName,
  photos,
  onAddFiles,
}: {
  bikeName: string;
  photos: PhotoVM[];
  /** Files picked from the empty state: photos or PDFs of the bike itself. */
  onAddFiles?: (files: File[]) => void;
}) {
  const viewer = usePhotoViewer();
  const [origin, setOrigin] = React.useState<PhotoOrigin | "">("");
  const [order, setOrder] = React.useState<"desc" | "asc">("desc");

  if (!photos.length && !onAddFiles) {
    return (
      <EmptyState compact art={CAMERA_ART} title={`Aucune photo pour ${bikeName}`}>
        Les photos du vélo, de ses composants, entretiens et sorties se rangent ici.
      </EmptyState>
    );
  }

  if (!photos.length) {
    return (
      <EmptyState
        art={CAMERA_ART}
        title={`Aucune photo pour ${bikeName}`}
        action={
          <>
            <UploadButton onFiles={(files) => onAddFiles?.(files)}>
              <Camera />
              Ajouter des photos
            </UploadButton>
            <p className="hint">Ou commence par :</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Numéro de cadre", "Facture d'achat", "Le vélo en entier"].map((label) => (
                <UploadButton
                  key={label}
                  variant="secondary"
                  size="sm"
                  onFiles={(files) => onAddFiles?.(files)}
                >
                  {label}
                </UploadButton>
              ))}
            </div>
          </>
        }
      >
        Photographie le vélo, son numéro de cadre et ta facture : utiles pour la garantie,
        l&apos;assurance ou une revente. Les photos de tes entretiens se rangeront ici aussi.
      </EmptyState>
    );
  }

  const list = photos
    .filter((photo) => !origin || photo.origin.kind === origin)
    .sort((a, b) =>
      order === "desc" ? b.takenOn.localeCompare(a.takenOn) : a.takenOn.localeCompare(b.takenOn),
    );
  const months: { key: string; photos: PhotoVM[] }[] = [];
  for (const photo of list) {
    const key = photo.takenOn.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.photos.push(photo);
    else months.push({ key, photos: [photo] });
  }
  const sequence = { title: `Photos · ${bikeName}`, photos: list };

  return (
    <div>
      <div className="mb-3.5 grid grid-cols-2 gap-2">
        <NativeSelect
          aria-label="Filtrer par origine"
          value={origin}
          onChange={(event) => setOrigin(event.target.value as PhotoOrigin | "")}
        >
          {ORIGIN_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Trier par date de prise de vue"
          value={order}
          onChange={(event) => setOrder(event.target.value as "desc" | "asc")}
        >
          <option value="desc">Plus récentes</option>
          <option value="asc">Plus anciennes</option>
        </NativeSelect>
      </div>
      <p className="sr-only" role="status">
        {list.length} photo{list.length > 1 ? "s" : ""}
      </p>
      {list.length ? (
        months.map((month, index) => (
          <section key={month.key}>
            <h3 className={`mb-2 flex items-center gap-2 eyebrow ${index ? "mt-[18px]" : ""}`}>
              {formatMonthYear(`${month.key}-01`)}
              <span className="num text-[13px] tracking-normal">· {month.photos.length}</span>
            </h3>
            <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 md:grid-cols-[repeat(auto-fill,minmax(124px,1fr))] md:gap-2">
              {month.photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    data-photo-id={photo.id}
                    aria-label={tileLabel(photo)}
                    onClick={() => viewer?.open(sequence, photo.id)}
                    className="relative block aspect-square w-full overflow-hidden rounded-[10px] bg-surface-2 text-left text-on-photo transition-transform hover:-translate-y-px"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span className="absolute inset-0 bg-[linear-gradient(to_top,var(--photo-shade),transparent_58%)]" />
                    <span
                      aria-hidden
                      className="absolute inset-x-[7px] bottom-1.5 line-clamp-2 text-[11.5px] leading-tight font-semibold"
                    >
                      {originLabel(photo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState
          compact
          title="Aucune photo ne correspond"
          action={
            <Button variant="secondary" size="sm" onClick={() => setOrigin("")}>
              <X />
              Effacer le filtre
            </Button>
          }
        >
          Essaie une autre origine.
        </EmptyState>
      )}
    </div>
  );
}
