/** The bike page's tabs (D-48, D-78), in the order of the phone and tablet tab bar. */
export const BIKE_TAB_IDS = ["plan", "components", "history", "record", "photos"] as const;

export type BikeTabId = (typeof BIKE_TAB_IDS)[number];

/** `?tab=` of the bike page; anything else is the first tab, "À prévoir". */
export function parseBikeTab(value: string | string[] | undefined): BikeTabId {
  const text = Array.isArray(value) ? value[0] : value;
  return BIKE_TAB_IDS.find((id) => id === text) ?? "plan";
}

/** Writes the tab into `params`; the first tab is the default, so it leaves `tab` out. */
export function writeBikeTab(params: URLSearchParams, tab: BikeTabId): void {
  if (tab === "plan") params.delete("tab");
  else params.set("tab", tab);
}

/** Rewrites the address's query in place: no navigation, no history entry (Next.js router synced). */
export function replaceQuery(update: (params: URLSearchParams) => void): void {
  const url = new URL(window.location.href);
  update(url.searchParams);
  if (url.href !== window.location.href) window.history.replaceState(null, "", url);
}
