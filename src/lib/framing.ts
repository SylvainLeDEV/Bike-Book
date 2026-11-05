import type { CSSProperties } from "react";

// How a photo is framed (D-103): a focus point (the subject, in % of the width and height from
// the top left) and a zoom in % (100 = none). Every cropped frame — cards, the bike page's
// banner, thumbnails, round pastilles — centres on the point as far as the photo allows, through
// the `.framed-photo` rule of globals.css. The original and its copies are never cut.

export type Framing = { focusXPct: number; focusYPct: number; zoomPct: number };

/** A framing with the photo's shape (width / height), which the CSS needs. */
export type PhotoFrame = Framing & { aspectRatio: number };

export const DEFAULT_FRAMING: Framing = { focusXPct: 50, focusYPct: 50, zoomPct: 100 };

export const ZOOM_MIN_PCT = 100;
export const ZOOM_MAX_PCT = 300;

export function isDefaultFraming(framing: Framing): boolean {
  return (
    framing.focusXPct === DEFAULT_FRAMING.focusXPct &&
    framing.focusYPct === DEFAULT_FRAMING.focusYPct &&
    framing.zoomPct === DEFAULT_FRAMING.zoomPct
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** A framing within its bounds, in whole percents (a point dragged past the edge stays on it). */
export function clampFraming(framing: Framing): Framing {
  return {
    focusXPct: clamp(framing.focusXPct, 0, 100),
    focusYPct: clamp(framing.focusYPct, 0, 100),
    zoomPct: clamp(framing.zoomPct, ZOOM_MIN_PCT, ZOOM_MAX_PCT),
  };
}

/** The frame of an image whose size is known; null otherwise (shown centred, as before). */
export function photoFrame(
  photo: (Framing & { widthPx: number | null; heightPx: number | null }) | null | undefined,
): PhotoFrame | null {
  if (!photo?.widthPx || !photo.heightPx) return null;
  const { focusXPct, focusYPct, zoomPct } = photo;
  return { focusXPct, focusYPct, zoomPct, aspectRatio: photo.widthPx / photo.heightPx };
}

/** The custom properties `.framed-photo` reads. */
export function frameStyle(frame: PhotoFrame): CSSProperties {
  return {
    "--fx": frame.focusXPct / 100,
    "--fy": frame.focusYPct / 100,
    "--z": frame.zoomPct / 100,
    "--r": frame.aspectRatio,
  } as CSSProperties;
}

/**
 * The part of the photo a frame shows, in fractions of the photo (left, top, width, height):
 * the largest box of the frame's shape that fits, divided by the zoom, centred on the focus and
 * kept inside the photo. The same computation as `.framed-photo`, for tests and descriptions.
 */
export function visibleRegion(
  frame: PhotoFrame,
  frameRatio: number,
): { left: number; top: number; width: number; height: number } {
  const zoom = frame.zoomPct / 100;
  // Frame wider than the photo: the full width shows, the height is cut (and the reverse).
  const width = (frameRatio >= frame.aspectRatio ? 1 : frameRatio / frame.aspectRatio) / zoom;
  const height = (frameRatio >= frame.aspectRatio ? frame.aspectRatio / frameRatio : 1) / zoom;
  const place = (focus: number, size: number) =>
    Math.min(1 - size, Math.max(0, focus / 100 - size / 2));
  return {
    left: place(frame.focusXPct, width),
    top: place(frame.focusYPct, height),
    width,
    height,
  };
}
