"use client";

import * as React from "react";
import {
  Bike,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cog,
  Image as ImageIcon,
  Mountain,
  Pencil,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import type { PhotoOrigin, PhotoVM } from "@/lib/view-models";

/*
 * Full-screen photo viewer (D-45): previous and next by buttons, arrow keys and swipe, Escape
 * closes, and the focus returns to the thumbnail that opened it, even if a re-render replaced
 * it. Delete goes through the caller, which shows the undo toast.
 */

export type PhotoSequence = { title: string; photos: PhotoVM[] };

export type PhotoViewerActions = {
  onDelete?: (photo: PhotoVM) => void;
  onSetCover?: (photo: PhotoVM) => void;
  onCaptionSave?: (photo: PhotoVM, caption: string | null) => void;
  /** Shows the element the photo belongs to (record, component, history entry). */
  onShowOrigin?: (photo: PhotoVM) => void;
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
};

const SHOW_ORIGIN_LABELS: Record<PhotoOrigin, string> = {
  bike: "Voir la fiche du vélo",
  component: "Voir dans les composants",
  maintenance_event: "Voir dans l'historique",
  ride: "Voir dans l'historique",
};

export function originLabel(photo: PhotoVM): string {
  const { kind, on } = photo.origin;
  if (kind === "bike") return "Vélo";
  if (kind === "component") return "Composant";
  const day = on ? formatDate(on, { month: "short", year: "never" }) : "";
  return kind === "maintenance_event" ? `Entretien du ${day}` : `Sortie du ${day}`;
}

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

  function remove() {
    if (!sequence || !photo) return;
    const rest = sequence.photos.filter((p) => p.id !== photo.id);
    actions.onDelete?.(photo);
    if (!rest.length) return close();
    setSequence({ ...sequence, photos: rest });
    setIndex(Math.min(index, rest.length - 1));
    requestAnimationFrame(() => captionRef.current?.focus({ preventScroll: true }));
  }

  function saveCaption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sequence || !photo) return;
    const value = String(new FormData(event.currentTarget).get("caption") ?? "").trim() || null;
    const updated = { ...photo, caption: value };
    setSequence({ ...sequence, photos: photos.map((p) => (p.id === photo.id ? updated : p)) });
    actions.onCaptionSave?.(photo, value);
    setEditing(false);
    requestAnimationFrame(() => captionRef.current?.focus({ preventScroll: true }));
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
                  <div>
                    {editing ? (
                      <form onSubmit={saveCaption} className="grid gap-2">
                        <Field label="Légende">
                          <Input
                            name="caption"
                            defaultValue={photo.caption ?? ""}
                            autoComplete="off"
                            placeholder="Ex. Joints racleurs encrassés"
                            autoFocus
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm">
                            Enregistrer
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                            Annuler
                          </Button>
                        </div>
                      </form>
                    ) : (
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
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={photo.caption ? "Modifier la légende" : "Ajouter une légende"}
                          onClick={() => setEditing(true)}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    )}
                    {photo.caption ? null : (
                      <p className="mt-1 hint">
                        Lu par les lecteurs d&apos;écran : « {photo.alt} ».
                      </p>
                    )}
                  </div>

                  <ul className="m-0 grid list-none gap-2.5 p-0 text-sm [&_svg]:mt-px [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-fg-muted">
                    <li className="flex items-start gap-2.5">
                      <Calendar aria-hidden />
                      <span>Prise le {formatDate(photo.takenOn, { month: "short" })}</span>
                    </li>
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
                        {actions.onShowOrigin ? (
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
                    <li className="flex items-start gap-2.5">
                      <Bike aria-hidden />
                      <span>{photo.bikeName}</span>
                    </li>
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    {photo.origin.kind === "bike" && actions.onSetCover ? (
                      <Button variant="ghost" size="sm" onClick={() => actions.onSetCover?.(photo)}>
                        <ImageIcon />
                        Photo principale
                      </Button>
                    ) : null}
                    {actions.onDelete ? (
                      <Button variant="ghost" size="sm" onClick={remove}>
                        <Trash2 />
                        Supprimer la photo
                      </Button>
                    ) : null}
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
