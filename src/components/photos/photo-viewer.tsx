"use client";

import * as React from "react";
import {
  Bike,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Download,
  Image as ImageIcon,
  Mountain,
  Package,
  Pencil,
  Wrench,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { AttachmentEditor, coverLabel } from "@/components/attachments/attachment-editor";
import { originLabel } from "@/components/attachments/origin";
import { useAttachmentService } from "@/components/attachments/service";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { ATTACHMENT_KIND_LABELS } from "@/lib/labels";
import type { AttachmentVM, PhotoOrigin } from "@/lib/view-models";

/*
 * Full-screen photo viewer (D-45): previous and next by buttons, arrow keys and swipe, Escape
 * closes, and the focus returns to the thumbnail that opened it, even if a re-render replaced
 * it. "Modifier" edits the caption, kind, date taken and cover, and deletes after a
 * confirmation (feature 10), through the attachment service: read-only without one.
 */

/** Images only: PDFs open in a new tab instead. */
export type PhotoSequence = { title: string; photos: AttachmentVM[] };

export type PhotoViewerActions = {
  /** Shows the element the photo belongs to (record, component, history entry). */
  onShowOrigin?: (photo: AttachmentVM) => void;
  /** After an edit or a delete, for lists that hold their own data (the block of a sheet). */
  onChanged?: () => void;
};

type ViewerContextValue = { open: (sequence: PhotoSequence, photoId: number) => void };
const ViewerContext = React.createContext<ViewerContextValue | null>(null);

export function usePhotoViewer() {
  return React.useContext(ViewerContext);
}

const ORIGIN_ICONS: Record<PhotoOrigin, typeof Bike> = {
  bike: Bike,
  component: Cog,
  maintenance_event: Wrench,
  ride: Mountain,
  task: ClipboardList,
  inventory_item: Package,
};

const SHOW_ORIGIN_LABELS: Partial<Record<PhotoOrigin, string>> = {
  bike: "Voir la fiche du vélo",
  component: "Voir dans les composants",
  maintenance_event: "Voir dans l'historique",
  ride: "Voir dans l'historique",
};

export { originLabel };

export function PhotoViewerProvider({
  children,
  ...actions
}: PhotoViewerActions & { children: React.ReactNode }) {
  const [sequence, setSequence] = React.useState<PhotoSequence | null>(null);
  const [index, setIndex] = React.useState(0);
  const [editing, setEditing] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const opener = React.useRef<HTMLElement | null>(null);
  const captionRef = React.useRef<HTMLHeadingElement>(null);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const service = useAttachmentService();

  const open = React.useCallback((next: PhotoSequence, photoId: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    setSequence(next);
    setIndex(
      Math.max(
        0,
        next.photos.findIndex((p) => p.id === photoId),
      ),
    );
    setEditing(false);
    setAnnouncement("");
  }, []);

  const photos = sequence?.photos ?? [];
  const photo = photos[index];
  const count = photos.length;

  const go = React.useCallback(
    (delta: number) => {
      if (!sequence) return;
      const next = index + delta;
      if (next < 0 || next >= sequence.photos.length) return;
      setIndex(next);
      setEditing(false);
      const p = sequence.photos[next];
      setAnnouncement(`Photo ${next + 1} sur ${sequence.photos.length} : ${p.caption ?? p.alt}`);
    },
    [index, sequence],
  );

  const close = () => setSequence(null);

  const focusCaption = () =>
    requestAnimationFrame(() => captionRef.current?.focus({ preventScroll: true }));

  function removed(gone: AttachmentVM) {
    if (!sequence) return;
    actions.onChanged?.();
    setEditing(false);
    const rest = sequence.photos.filter((p) => p.id !== gone.id);
    if (!rest.length) return close();
    setSequence({ ...sequence, photos: rest });
    setIndex(Math.min(index, rest.length - 1));
    setAnnouncement("Photo supprimée");
    focusCaption();
  }

  function saved(updated: AttachmentVM) {
    if (!sequence) return;
    actions.onChanged?.();
    // Only one cover per element: the others of the sequence lose it.
    const photos = sequence.photos.map((p) =>
      p.id === updated.id
        ? updated
        : updated.isCover &&
            p.origin.kind === updated.origin.kind &&
            p.origin.id === updated.origin.id
          ? { ...p, isCover: false }
          : p,
    );
    setSequence({ ...sequence, photos });
    setEditing(false);
    setAnnouncement("Modifications enregistrées");
    focusCaption();
  }

  const OriginIcon = photo ? ORIGIN_ICONS[photo.origin.kind] : Bike;

  return (
    <ViewerContext.Provider value={{ open }}>
      {children}
      <Dialog.Root open={sequence !== null} onOpenChange={(isOpen) => !isOpen && close()}>
        <Dialog.Portal>
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col bg-bg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              captionRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              // Back to the thumbnail that opened the viewer, or to the same photo's thumbnail if
              // the list was re-rendered meanwhile.
              event.preventDefault();
              const target =
                opener.current && document.contains(opener.current)
                  ? opener.current
                  : photo
                    ? document.querySelector<HTMLElement>(`[data-photo-id="${photo.id}"]`)
                    : null;
              target?.focus({ preventScroll: true });
            }}
            onKeyDown={(event) => {
              const typing = (event.target as HTMLElement).matches("input, textarea, select");
              if (typing) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                go(-1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                go(1);
              }
            }}
          >
            <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface pr-2 pl-4">
              <Dialog.Title className="min-w-0 flex-1 truncate text-base leading-tight font-semibold">
                {sequence?.title ?? "Photos"}
              </Dialog.Title>
              {count > 1 ? (
                <span className="px-1.5 num text-base font-semibold text-fg-muted" aria-hidden>
                  {index + 1} / {count}
                </span>
              ) : null}
              <p className="sr-only" role="status">
                {announcement}
              </p>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fermer la visionneuse">
                  <X />
                </Button>
              </Dialog.Close>
            </div>

            {photo ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
                <div
                  className="relative mx-auto aspect-[4/3] max-h-[62dvh] w-full touch-pan-y bg-surface-2 select-none lg:grid lg:aspect-auto lg:h-full lg:max-h-none lg:place-items-center lg:p-6"
                  onPointerDown={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    swipeStart.current = { x: event.clientX, y: event.clientY };
                  }}
                  onPointerUp={(event) => {
                    const start = swipeStart.current;
                    swipeStart.current = null;
                    if (!start) return;
                    const dx = event.clientX - start.x;
                    const dy = event.clientY - start.y;
                    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1);
                  }}
                  onPointerCancel={() => {
                    swipeStart.current = null;
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
                  <img
                    src={photo.url}
                    alt={photo.caption ?? photo.alt}
                    draggable={false}
                    className="absolute inset-0 size-full object-contain lg:relative lg:inset-auto lg:max-h-full lg:w-auto lg:rounded-card lg:shadow-(--shadow-md)"
                  />
                  {count > 1 ? (
                    <>
                      <NavButton side="left" disabled={index === 0} onClick={() => go(-1)} />
                      <NavButton
                        side="right"
                        disabled={index === count - 1}
                        onClick={() => go(1)}
                      />
                    </>
                  ) : null}
                </div>

                <div className="grid content-start gap-[18px] p-4 pb-[max(28px,env(safe-area-inset-bottom))] lg:overflow-y-auto lg:border-l lg:border-border lg:bg-surface lg:p-5">
                  {editing ? (
                    <AttachmentEditor
                      key={photo.id}
                      attachment={photo}
                      onSaved={saved}
                      onDeleted={removed}
                      onCancel={() => {
                        setEditing(false);
                        focusCaption();
                      }}
                    />
                  ) : (
                    <div>
                      <div className="flex items-start gap-2">
                        <h3
                          ref={captionRef}
                          tabIndex={-1}
                          className={
                            photo.caption
                              ? "min-w-0 flex-1 text-lg leading-[1.35] font-semibold outline-none"
                              : "min-w-0 flex-1 text-lg leading-[1.35] font-medium text-fg-muted outline-none"
                          }
                        >
                          {photo.caption ?? "Sans légende"}
                        </h3>
                        {service ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Modifier la photo"
                            onClick={() => setEditing(true)}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                      </div>
                      {photo.caption ? null : (
                        <p className="mt-1 hint">
                          Lu par les lecteurs d&apos;écran : « {photo.alt} ».
                        </p>
                      )}
                    </div>
                  )}

                  <ul className="m-0 grid list-none gap-2.5 p-0 text-sm [&_svg]:mt-px [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-fg-muted">
                    {photo.takenOn ? (
                      <li className="flex items-start gap-2.5">
                        <Calendar aria-hidden />
                        <span>
                          Prise le {formatDate(photo.takenOn, { month: "short" })}
                          {photo.takenTime ? ` à ${photo.takenTime.replace(":", " h ")}` : ""}
                        </span>
                      </li>
                    ) : null}
                    {photo.kind !== "photo" || photo.isCover ? (
                      <li className="flex items-start gap-2.5">
                        <ImageIcon aria-hidden />
                        <span>
                          {photo.kind !== "photo"
                            ? ATTACHMENT_KIND_LABELS[photo.kind]
                            : (coverLabel(photo) ?? "")}
                        </span>
                      </li>
                    ) : null}
                    <li className="flex items-start gap-2.5">
                      <OriginIcon aria-hidden />
                      <span>
                        {photo.origin.kind === "bike" ? (
                          "Photo du vélo"
                        ) : (
                          <>
                            {originLabel(photo)} ·{" "}
                            <b className="font-semibold">{photo.origin.title}</b>
                          </>
                        )}
                        {actions.onShowOrigin && SHOW_ORIGIN_LABELS[photo.origin.kind] ? (
                          <>
                            <br />
                            <Button
                              variant="link"
                              onClick={() => {
                                close();
                                actions.onShowOrigin?.(photo);
                              }}
                            >
                              {SHOW_ORIGIN_LABELS[photo.origin.kind]}
                            </Button>
                          </>
                        ) : null}
                      </span>
                    </li>
                    {photo.bikeName && photo.origin.kind !== "bike" ? (
                      <li className="flex items-start gap-2.5">
                        <Bike aria-hidden />
                        <span>{photo.bikeName}</span>
                      </li>
                    ) : null}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={photo.downloadUrl} download={photo.name}>
                        <Download />
                        Télécharger l&apos;original
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ViewerContext.Provider>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Photo précédente" : "Photo suivante"}
      className={
        "absolute top-1/2 -mt-[22px] grid size-11 place-items-center rounded-full border border-border bg-surface text-fg shadow-(--shadow-md) disabled:cursor-not-allowed disabled:opacity-40 " +
        (side === "left" ? "left-2.5 lg:left-5" : "right-2.5 lg:right-5")
      }
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
