"use client";

import * as React from "react";
import { Paperclip, Star } from "lucide-react";
import { PhotoViewerProvider, usePhotoViewer } from "@/components/photos/photo-viewer";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import type { AttachmentVM } from "@/lib/view-models";
import { DocumentList } from "./document-list";
import { useAttachmentService, type AttachmentOwnerRef } from "./service";
import { UploadButton, UploadRows } from "./upload-controls";
import { useUploads } from "./use-uploads";

/*
 * "Pièces jointes" (feature 10, D-74): one block for every element (bike, component,
 * maintenance event, ride, task, workshop item of any kind). Photos as thumbnails that open the
 * viewer, documents as a list, and "Ajouter" for photos and PDFs alike, each file with its
 * progress. It loads its own list, so a sheet only says which element it is about.
 */

export function AttachmentsBlock({
  owner,
  title = "Pièces jointes",
}: {
  owner: AttachmentOwnerRef;
  title?: string;
}) {
  const service = useAttachmentService();
  const [list, setList] = React.useState<AttachmentVM[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const titleId = React.useId();
  // A stable reference, so the effects below run once per element.
  const ownerRef = React.useMemo(
    () => ({ kind: owner.kind, id: owner.id }),
    [owner.kind, owner.id],
  );

  const reload = React.useCallback(async () => {
    if (!service) return;
    try {
      setList((await service.list(ownerRef)) ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [ownerRef, service]);

  React.useEffect(() => {
    // Loading from the server; the state is set once the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    void reload();
  }, [reload]);

  const uploads = useUploads(ownerRef, { onUploaded: reload });
  if (!service) return null;

  const photos = (list ?? []).filter((a) => a.isImage && a.kind === "photo");
  const documents = (list ?? []).filter((a) => !(a.isImage && a.kind === "photo"));

  return (
    <PhotoViewerProvider onChanged={reload}>
      <section aria-labelledby={titleId} className="grid gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-[13.5px] leading-tight font-semibold">
            {title}
            {list?.length ? (
              <span className="ml-1.5 num text-[14px] font-semibold text-fg-muted">
                {list.length}
              </span>
            ) : null}
          </h3>
          <UploadButton variant="secondary" size="sm" onFiles={(files) => uploads.add(files)}>
            <Paperclip />
            Ajouter
          </UploadButton>
        </div>
        {list == null && !failed ? (
          <div className="flex gap-1.5" aria-hidden>
            <Skeleton className="size-14" />
            <Skeleton className="size-14" />
          </div>
        ) : failed ? (
          <p className="hint">Pièces jointes indisponibles pour l&apos;instant.</p>
        ) : list?.length ? (
          <>
            {photos.length ? <Thumbs photos={photos} /> : null}
            <DocumentList documents={documents} onChanged={() => void reload()} />
          </>
        ) : (
          <p className="hint">
            Aucune pièce jointe. Photos (JPEG, PNG, WebP) ou PDF, 25 Mo au maximum par fichier.
          </p>
        )}
        <UploadRows rows={uploads.rows} onDismiss={uploads.dismiss} />
        <p className="sr-only" role="status">
          {list ? formatCount(list.length, "pièce jointe", "pièces jointes") : ""}
        </p>
      </section>
    </PhotoViewerProvider>
  );
}

function Thumbs({ photos }: { photos: AttachmentVM[] }) {
  const viewer = usePhotoViewer();
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {photos.map((photo) => (
        <li key={photo.id}>
          <button
            type="button"
            data-photo-id={photo.id}
            onClick={() => viewer?.open({ title: "Photos", photos }, photo.id)}
            aria-label={`Voir la photo : ${photo.caption ?? photo.alt}${photo.isCover ? " (photo principale)" : ""}`}
            className="relative block size-14 overflow-hidden rounded-[10px] bg-surface-2 transition-transform hover:-translate-y-px pointer-coarse:size-16"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
            <img src={photo.thumbUrl ?? ""} alt="" className="size-full object-cover" />
            {photo.isCover ? (
              <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-photo-glass text-on-photo backdrop-blur-md">
                <Star className="size-3" aria-hidden />
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Creation sheets: the element must exist before a file can be attached (D-74). */
export function AttachmentsLater() {
  return (
    <p className="flex items-start gap-1.5 hint">
      <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      Photos et documents : tu pourras les joindre une fois l&apos;élément enregistré.
    </p>
  );
}
