/**
 * Rewrites the address's query in place: no navigation, no history entry (Next.js router synced).
 * Shared by the filters kept in the address: bike tabs, history (D-78), workshop (D-85).
 */
export function replaceQuery(update: (params: URLSearchParams) => void): void {
  const url = new URL(window.location.href);
  update(url.searchParams);
  if (url.href !== window.location.href) window.history.replaceState(null, "", url);
}
