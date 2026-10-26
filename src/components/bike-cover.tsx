import { cn } from "cn";
import type { BikeCoverVM } from "@/lib/view-models";

/*
 * Placeholder art for a bike without a photo: sky, two mountain ridges and a bike line. Its
 * colours are illustration colours (they stand in for a photo), the one place where literal
 * colours are allowed. A bike gets one palette, by `artIndex`.
 */
const PALETTES: readonly (readonly [sky1: string, sky2: string, far: string, near: string])[] = [
  ["oklch(0.72 0.08 250)", "oklch(0.88 0.07 55)", "oklch(0.48 0.06 265)", "oklch(0.3 0.04 265)"],
  ["oklch(0.82 0.05 200)", "oklch(0.92 0.04 120)", "oklch(0.52 0.08 155)", "oklch(0.33 0.06 160)"],
  ["oklch(0.83 0.07 230)", "oklch(0.93 0.06 90)", "oklch(0.7 0.1 80)", "oklch(0.52 0.09 60)"],
  ["oklch(0.78 0.06 300)", "oklch(0.9 0.05 20)", "oklch(0.5 0.07 320)", "oklch(0.32 0.05 320)"],
  ["oklch(0.8 0.05 180)", "oklch(0.93 0.03 200)", "oklch(0.55 0.05 220)", "oklch(0.36 0.04 230)"],
  ["oklch(0.86 0.06 80)", "oklch(0.94 0.04 100)", "oklch(0.6 0.08 40)", "oklch(0.4 0.07 30)"],
];

export function coverPalette(artIndex: number) {
  return PALETTES[((artIndex % PALETTES.length) + PALETTES.length) % PALETTES.length];
}

const BIKE_PATH =
  "M26 48 L56 48 L46 20 Z M46 20 L82 18 M56 48 L84 26 M82 18 L84 26 L94 48 M82 18 L84 12 L91 11 M46 20 L44 12 M38 11 L50 11 M56 48 L61 54";

/** The bike drawn with lines, in `currentColor`. Also used for empty states. */
export function BikeLine({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70" aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="26" cy="48" r="17" />
        <circle cx="94" cy="48" r="17" />
        <path d={BIKE_PATH} />
      </g>
    </svg>
  );
}

type BikeCoverProps = {
  cover: BikeCoverVM;
  /** "span" inside inline content (chips, pills). */
  as?: "div" | "span";
  /** Hide the bike line (small squares, pastilles). */
  bare?: boolean;
  className?: string;
  children?: React.ReactNode;
};

/** The bike's photo, or its placeholder art. Decorative: the bike name is always next to it. */
export function BikeCover({
  cover,
  as: Tag = "div",
  bare = false,
  className,
  children,
}: BikeCoverProps) {
  if (cover.photoUrl) {
    return (
      <Tag className={cn("relative block overflow-hidden bg-surface-2", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
        <img src={cover.photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        {children}
      </Tag>
    );
  }
  const [sky1, sky2, far, near] = coverPalette(cover.artIndex);
  return (
    <Tag
      className={cn("relative block overflow-hidden", className)}
      style={{ background: `linear-gradient(180deg, ${sky1}, ${sky2})` }}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden
        focusable="false"
      >
        <polygon
          fill={far}
          points="0,118 38,86 64,102 112,52 150,90 176,74 214,104 252,66 290,96 320,80 320,180 0,180"
        />
        <polygon
          fill={near}
          points="0,150 52,124 96,142 150,116 204,140 250,122 320,140 320,180 0,180"
        />
      </svg>
      {bare ? null : (
        <BikeLine className="absolute bottom-[7%] left-1/2 w-2/5 -translate-x-1/2 text-on-photo opacity-90" />
      )}
      {children}
    </Tag>
  );
}

/** A bike "pastille": a tiny round cover, for rows that name several bikes. */
export function BikePip({ cover, className }: { cover: BikeCoverVM; className?: string }) {
  const [sky1, , far, near] = coverPalette(cover.artIndex);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 rounded-full shadow-[0_0_0_2px_var(--pip-ring,var(--surface))] not-first:-ml-[5px]",
        className,
      )}
      style={{
        background: cover.photoUrl
          ? `center / cover url(${JSON.stringify(cover.photoUrl)})`
          : `linear-gradient(170deg, ${sky1} 0 46%, ${far} 46% 72%, ${near} 72%)`,
      }}
    />
  );
}
