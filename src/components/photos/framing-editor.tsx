"use client";

import * as React from "react";
import { Check, LocateFixed } from "lucide-react";
import { useAttachmentService } from "@/components/attachments/service";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  clampFraming,
  DEFAULT_FRAMING,
  isDefaultFraming,
  ZOOM_MAX_PCT,
  ZOOM_MIN_PCT,
  type Framing,
  type PhotoFrame,
} from "@/lib/framing";
import type { AttachmentVM } from "@/lib/view-models";
import { FramedImage } from "./framed-image";

/*
 * "Cadrer" (D-103), inside the photo viewer: the whole photo with the focus point, which a tap or
 * a drag places on the subject (arrow keys move it, Shift for bigger steps), a zoom from ×1 to
 * ×3, and live previews of the shapes the photo takes in the app. Renders the viewer's two
 * cells: the photo, then the panel.
 */

const zoomText = (zoomPct: number) =>
  `×${(zoomPct / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;

export function FramingEditor({
  photo,
  frame,
  onSaved,
  onCancel,
}: {
  photo: AttachmentVM;
  frame: PhotoFrame;
  onSaved: (frame: PhotoFrame) => void;
  onCancel: () => void;
}) {
  const service = useAttachmentService();
  const [framing, setFraming] = React.useState<Framing>({
    focusXPct: frame.focusXPct,
    focusYPct: frame.focusYPct,
    zoomPct: frame.zoomPct,
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const picture = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const live: PhotoFrame = { ...framing, aspectRatio: frame.aspectRatio };

  // The point first: the panel's button that opened the editor is gone.
  React.useEffect(() => picture.current?.focus({ preventScroll: true }), []);

  const update = (next: Partial<Framing>) =>
    setFraming((current) => clampFraming({ ...current, ...next }));

  function pointAt(event: React.PointerEvent) {
    const box = picture.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    update({
      focusXPct: ((event.clientX - box.left) / box.width) * 100,
      focusYPct: ((event.clientY - box.top) / box.height) * 100,
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    // The viewer's own arrows go to the previous and next photo: not while framing.
    event.preventDefault();
    event.stopPropagation();
    const next = clampFraming({
      ...framing,
      focusXPct: framing.focusXPct + move[0],
      focusYPct: framing.focusYPct + move[1],
    });
    setFraming(next);
    setAnnouncement(
      `Point à ${next.focusXPct} % depuis la gauche, ${next.focusYPct} % depuis le haut`,
    );
  }

  async function save() {
    if (!service) return;
    setPending(true);
    setError(null);
    try {
      const result = await service.setFraming(photo.id, framing);
      if (result.ok) onSaved(live);
      else setError(result.error);
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="relative mx-auto aspect-[4/3] max-h-[62dvh] w-full bg-surface-2 lg:aspect-auto lg:h-full lg:max-h-none">
        <div className="[container-type:size] absolute inset-3 grid place-items-center lg:inset-6">
          <div
            ref={picture}
            tabIndex={0}
            role="group"
            aria-label="Point de focus"
            aria-describedby="framing-hint"
            className="relative cursor-crosshair touch-none select-none"
            style={{
              aspectRatio: frame.aspectRatio,
              width: `min(100cqw, 100cqh * ${frame.aspectRatio})`,
            }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointAt(event);
            }}
            onPointerMove={(event) => {
              if (dragging.current) pointAt(event);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onKeyDown={onKeyDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
            <img
              src={photo.url}
              alt={photo.caption ?? photo.alt}
              draggable={false}
              className="size-full rounded-[10px] object-contain"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute size-9 -translate-1/2 rounded-full border-[3px] border-on-photo shadow-(--shadow-md) ring-[1.5px] ring-photo-shade"
              style={{ left: `${framing.focusXPct}%`, top: `${framing.focusYPct}%` }}
            >
              <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-on-photo ring-1 ring-photo-shade" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4 p-4 pb-[max(28px,env(safe-area-inset-bottom))] lg:overflow-y-auto lg:border-l lg:border-border lg:bg-surface lg:p-5">
        <div>
          <h3 className="text-lg leading-[1.35] font-semibold">Cadrer la photo</h3>
          <p id="framing-hint" className="mt-1 hint">
            Touche le sujet sur la photo (le vélo, une pièce) : les cartes, le bandeau et les
            vignettes se centrent dessus. La photo elle-même n&apos;est pas modifiée.
          </p>
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <label className="grid gap-1.5">
          <span className="flex items-baseline justify-between text-sm font-semibold">
            Zoom
            <output className="num text-base text-fg-muted">{zoomText(framing.zoomPct)}</output>
          </span>
          <input
            type="range"
            min={ZOOM_MIN_PCT}
            max={ZOOM_MAX_PCT}
            step={5}
            value={framing.zoomPct}
            aria-label="Zoom"
            aria-valuetext={zoomText(framing.zoomPct)}
            onChange={(event) => update({ zoomPct: Number(event.target.value) })}
            className="h-11 w-full accent-brand"
          />
        </label>

        <div className="grid gap-2.5" aria-label="Aperçus" role="group">
          <Preview label="Carte">
            <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-surface-2">
              <FramedImage src={photo.url} frame={live} />
            </div>
          </Preview>
          <Preview label="Bandeau">
            <div className="relative aspect-[3/1] w-full overflow-hidden rounded-[10px] bg-surface-2">
              <FramedImage src={photo.url} frame={live} />
            </div>
          </Preview>
          <div className="flex items-end gap-4">
            <Preview label="Vignette">
              <div className="relative size-16 overflow-hidden rounded-[10px] bg-surface-2">
                <FramedImage src={photo.thumbUrl ?? photo.url} frame={live} />
              </div>
            </Preview>
            <Preview label="Pastille">
              <div className="relative size-10 overflow-hidden rounded-full bg-surface-2">
                <FramedImage src={photo.thumbUrl ?? photo.url} frame={live} />
              </div>
            </Preview>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || !service} onClick={() => void save()}>
            <Check />
            Enregistrer
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={pending || isDefaultFraming(framing)}
            onClick={() => {
              setFraming(DEFAULT_FRAMING);
              setAnnouncement("Cadrage recentré");
            }}
          >
            <LocateFixed />
            Recentrer
          </Button>
        </div>
      </div>
    </>
  );
}

function Preview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 grid gap-1">
      {children}
      <figcaption className="hint">{label}</figcaption>
    </figure>
  );
}
