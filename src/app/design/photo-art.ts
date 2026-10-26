/*
 * Simulated photos for the /design route: the mockup's illustrations, turned into SVG data URIs
 * so the screens use plain <img> elements exactly as they will with real uploads. Their colours
 * are illustration colours, standing in for photos (fictitious data, D-22).
 */

type Colours = readonly [sky1: string, sky2: string, mid: string, dark: string, ink: string];

const BIKE_PATH =
  "M26 48 L56 48 L46 20 Z M46 20 L82 18 M56 48 L84 26 M82 18 L84 26 L94 48 M82 18 L84 12 L91 11 M46 20 L44 12 M38 11 L50 11 M56 48 L61 54";

const SCENES = {
  land: (c: Colours) =>
    `<polygon fill="${c[2]}" points="0,78 26,58 44,68 76,34 102,60 120,48 146,68 160,58 160,120 0,120"/><polygon fill="${c[3]}" points="0,100 36,84 64,94 102,78 138,92 160,84 160,120 0,120"/><g transform="translate(46 54) scale(0.58)" fill="none" stroke="${c[4]}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="48" r="17"/><circle cx="94" cy="48" r="17"/><path d="${BIKE_PATH}"/></g>`,
  chain: (c: Colours) =>
    `<circle cx="70" cy="54" r="44" fill="${c[2]}"/><circle cx="70" cy="54" r="50" fill="none" stroke="${c[2]}" stroke-width="9" stroke-dasharray="5 4.4"/><circle cx="70" cy="54" r="16" fill="${c[3]}"/><path d="M-10 106 Q70 88 170 72" fill="none" stroke="${c[3]}" stroke-width="14" stroke-linecap="round" stroke-dasharray="11 3"/><path d="M-10 106 Q70 88 170 72" fill="none" stroke="${c[1]}" stroke-width="4" stroke-dasharray="4 10"/><rect x="102" y="60" width="42" height="14" rx="4" fill="${c[4]}" transform="rotate(-12 123 67)"/>`,
  fork: (c: Colours) =>
    `<rect x="28" y="-4" width="104" height="20" rx="6" fill="${c[3]}"/><rect x="40" y="10" width="18" height="70" rx="4" fill="${c[2]}"/><rect x="102" y="10" width="18" height="70" rx="4" fill="${c[2]}"/><rect x="35" y="62" width="28" height="64" rx="8" fill="${c[3]}"/><rect x="97" y="62" width="28" height="64" rx="8" fill="${c[3]}"/><path d="M63 94 Q80 80 97 94" fill="none" stroke="${c[3]}" stroke-width="8"/><g fill="${c[4]}"><circle cx="45" cy="66" r="3"/><circle cx="54" cy="70" r="2.4"/><circle cx="108" cy="67" r="3"/><circle cx="117" cy="71" r="2.4"/></g>`,
  serial: (c: Colours) =>
    `<g transform="rotate(-8 80 62)"><rect x="-20" y="30" width="200" height="64" rx="30" fill="${c[2]}"/><rect x="34" y="44" width="92" height="36" rx="5" fill="${c[4]}"/><path d="M42 54 H96 M42 62 H84" stroke="${c[3]}" stroke-width="4" stroke-linecap="round"/><path d="M42 72 H118" stroke="${c[3]}" stroke-width="6" stroke-dasharray="1.5 1 3 1.5 1 2"/></g>`,
  tire: (c: Colours) =>
    `<circle cx="80" cy="170" r="96" fill="none" stroke="${c[2]}" stroke-width="8"/><circle cx="80" cy="170" r="118" fill="none" stroke="${c[3]}" stroke-width="40"/><circle cx="80" cy="170" r="140" fill="none" stroke="${c[3]}" stroke-width="12" stroke-dasharray="9 7"/><path d="M60 54 l7 6 l-5 5 l8 6 l-4 7" fill="none" stroke="${c[4]}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  doc: (c: Colours) =>
    `<g transform="rotate(-4 80 60)"><rect x="34" y="6" width="92" height="118" rx="4" fill="oklch(0.97 0.01 90)"/><path d="M46 24 H96 M46 36 H112 M46 46 H104 M46 56 H110 M46 66 H90" stroke="${c[2]}" stroke-width="3.5" stroke-linecap="round"/><path d="M82 92 H114" stroke="${c[3]}" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="94" r="12" fill="none" stroke="${c[4]}" stroke-width="3"/></g>`,
  wrench: (c: Colours) =>
    `<path d="M6 108 L116 42" stroke="${c[3]}" stroke-width="14" stroke-linecap="round"/><circle cx="124" cy="36" r="15" fill="${c[3]}"/><polygon points="124,27 132,31.5 132,40.5 124,45 116,40.5 116,31.5" fill="${c[2]}"/><rect x="24" y="82" width="34" height="13" rx="4" fill="${c[4]}" transform="rotate(-31 41 88)"/><path d="M62 70 A22 22 0 0 1 88 58" fill="none" stroke="${c[2]}" stroke-width="3"/>`,
  derailleur: (c: Colours) =>
    `<rect x="94" y="0" width="60" height="32" rx="10" fill="${c[3]}"/><g transform="rotate(-10 80 60)"><rect x="56" y="16" width="44" height="98" rx="20" fill="${c[3]}"/><circle cx="78" cy="38" r="17" fill="none" stroke="${c[2]}" stroke-width="5" stroke-dasharray="3 3"/><circle cx="78" cy="38" r="13" fill="${c[2]}"/><circle cx="78" cy="90" r="17" fill="none" stroke="${c[2]}" stroke-width="5" stroke-dasharray="3 3"/><circle cx="78" cy="90" r="13" fill="${c[2]}"/><circle cx="78" cy="38" r="4" fill="${c[4]}"/><circle cx="78" cy="90" r="4" fill="${c[4]}"/></g>`,
  pads: (c: Colours) =>
    `<g transform="rotate(-8 80 60)"><rect x="18" y="30" width="58" height="54" rx="12" fill="${c[3]}"/><rect x="22" y="36" width="50" height="10" rx="4" fill="${c[2]}"/><rect x="86" y="30" width="58" height="54" rx="12" fill="${c[3]}"/><rect x="90" y="36" width="50" height="36" rx="6" fill="${c[2]}"/><circle cx="47" cy="72" r="5" fill="${c[4]}"/><circle cx="115" cy="78" r="4" fill="${c[4]}"/></g>`,
  shock: (c: Colours) =>
    `<g transform="rotate(-18 80 60)"><rect x="70" y="50" width="72" height="18" rx="6" fill="${c[3]}"/><rect x="4" y="40" width="82" height="38" rx="14" fill="${c[2]}"/><rect x="92" y="47" width="5" height="24" rx="2" fill="${c[4]}"/><circle cx="148" cy="59" r="12" fill="${c[2]}"/><circle cx="148" cy="59" r="4" fill="${c[3]}"/></g>`,
} as const;

export type Scene = keyof typeof SCENES;

/** An SVG data URI; `frame` = [scale, rotation in degrees, dx, dy] like the mockup. */
export function photoArt(
  scene: Scene,
  colours: Colours,
  frame: readonly [number, number, number, number] = [1, 0, 0, 0],
): string {
  const [scale, rotation, dx, dy] = frame;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${colours[0]}"/><stop offset="1" stop-color="${colours[1]}"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><g transform="translate(${80 + dx} ${60 + dy}) rotate(${rotation}) scale(${scale}) translate(-80 -60)">${SCENES[scene](colours)}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
