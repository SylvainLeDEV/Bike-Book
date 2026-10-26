"use client";

import { usePhotoViewer } from "./photo-viewer";
import type { PhotoVM } from "@/lib/view-models";

/** A row of 48 px thumbnails that open the viewer on that sequence. */
export function PhotoThumbs({
  photos,
  title,
  extra,
}: {
  photos: PhotoVM[];
  /** Title of the viewer for this sequence. */
  title: string;
  /** Appended control, e.g. "add photos" on a maintenance event. */
  extra?: React.ReactNode;
}) {
  const viewer = usePhotoViewer();
  if (!photos.length && !extra) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {photos.map((photo) => {
        const image = (
          // eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler
          <img src={photo.thumbUrl} alt="" className="size-full object-cover" />
        );
        return viewer ? (
          <button
            key={photo.id}
            type="button"
            data-photo-id={photo.id}
            onClick={() => viewer.open({ title, photos }, photo.id)}
            aria-label={`Voir la photo : ${photo.caption ?? photo.alt}`}
            className="size-12 shrink-0 overflow-hidden rounded-[9px] bg-surface-2 transition-transform hover:-translate-y-px"
          >
            {image}
          </button>
        ) : (
          <span key={photo.id} className="size-12 shrink-0 overflow-hidden rounded-[9px]">
            {image}
          </span>
        );
      })}
      {extra}
    </div>
  );
}
