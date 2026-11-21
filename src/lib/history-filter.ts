import { maintenanceFigures } from "./display";
import type { LocalDate } from "./format";
import { MAINTENANCE_ACTION_LABELS, RIDE_TYPE_LABELS } from "./labels";
import { matchesWords, searchWords } from "./search";
import type { TimelineItemVM } from "./view-models";

/*
 * Filters of a history (D-78): a year, a month of that year, kinds of entry; a search and, on
 * Activité, a bike (D-112). Pure: the server reads them from the page's query, the browser applies
 * them and writes them back. Entries carry local dates (`YYYY-MM-DD`, already in TZ): nothing here
 * uses the device's time zone.
 */

export type HistoryKind = TimelineItemVM["kind"];

/** Display order of the kinds. */
export const HISTORY_KINDS: readonly HistoryKind[] = ["ride", "maintenance", "task"];

export type HistoryFilter = {
  year: number | null;
  /** 1 to 12; only with a year. */
  month: number | null;
  /** In `HISTORY_KINDS` order, no duplicates; empty means every kind. */
  kinds: HistoryKind[];
  /** The search as typed (D-112); "" when none. */
  query: string;
  /** Activité's bike list (D-112); null: every bike. */
  bikeId: number | null;
};

export const NO_HISTORY_FILTER: HistoryFilter = {
  year: null,
  month: null,
  kinds: [],
  query: "",
  bikeId: null,
};

/** The longest search kept, as the Atelier's. */
const QUERY_MAX_LENGTH = 100;

/** How many entries a history shows first, then adds with "Voir plus". */
export const HISTORY_PAGE_SIZE = 50;

type Entry = { kind: HistoryKind; on: LocalDate };
type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Valid kinds, deduplicated, in display order. */
export function normalizeKinds(values: readonly string[]): HistoryKind[] {
  return HISTORY_KINDS.filter((kind) => values.includes(kind));
}

/**
 * The filter in a page's query: `?q=chaine&bike=2&year=2026&month=10&kind=maintenance&kind=task`
 * (a comma list of kinds is read too). Invalid values are ignored; a month without a year is
 * dropped.
 */
export function parseHistoryFilter(query: Query): HistoryFilter {
  const yearText = first(query.year);
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const monthText = first(query.month);
  const month =
    year != null && monthText && /^(0?[1-9]|1[0-2])$/.test(monthText) ? Number(monthText) : null;
  const kind = query.kind;
  const kinds = normalizeKinds(
    (Array.isArray(kind) ? kind : kind ? [kind] : []).flatMap((value) => value.split(",")),
  );
  const bikeText = first(query.bike);
  const bikeId = bikeText && /^[1-9]\d{0,15}$/.test(bikeText) ? Number(bikeText) : null;
  return {
    year,
    month,
    kinds,
    query: (first(query.q) ?? "").slice(0, QUERY_MAX_LENGTH),
    bikeId: bikeId != null && Number.isSafeInteger(bikeId) ? bikeId : null,
  };
}

/**
 * Writes the filter into `params` (`q`, `bike`, `year`, `month` as two digits, `kind` repeated);
 * keeps the rest.
 */
export function writeHistoryFilter(params: URLSearchParams, filter: HistoryFilter): void {
  for (const key of ["q", "bike", "year", "month", "kind"]) params.delete(key);
  if (filter.query.trim()) params.set("q", filter.query);
  if (filter.bikeId != null) params.set("bike", String(filter.bikeId));
  if (filter.year != null) {
    params.set("year", String(filter.year));
    if (filter.month != null) params.set("month", String(filter.month).padStart(2, "0"));
  }
  for (const kind of filter.kinds) params.append("kind", kind);
}

export function isHistoryFiltered(filter: HistoryFilter): boolean {
  return (
    filter.year != null ||
    filter.kinds.length > 0 ||
    Boolean(filter.query.trim()) ||
    filter.bikeId != null
  );
}

/**
 * What the search reads in an entry (D-112): its title and bike; a ride's type, place and notes;
 * an event's note, shop or "fait maison", and the parts its lines touched; a task's note.
 */
export function historySearchText(item: TimelineItemVM): string {
  const words: (string | null | undefined)[] = [item.title, item.bikeName];
  if (item.kind === "ride") {
    words.push(RIDE_TYPE_LABELS[item.rideType], item.location, item.notes);
  } else if (item.kind === "maintenance") {
    words.push(item.note, item.shopName, maintenanceFigures(null, item.performedBy));
    for (const part of item.parts ?? []) {
      words.push(`${MAINTENANCE_ACTION_LABELS[part.action]} ${part.slot}`);
    }
  } else {
    words.push(item.note);
  }
  return words.filter(Boolean).join(" ");
}

/**
 * The entries the search and the bike keep (D-112), in their order: every word of the search is
 * in the entry's text (case and accents ignored, any order). The period and kinds come after
 * (`filterHistory`), so the lists and chips count what the search found.
 */
export function searchHistory<T extends TimelineItemVM>(
  items: readonly T[],
  filter: Pick<HistoryFilter, "query" | "bikeId">,
): T[] {
  const words = searchWords(filter.query);
  if (!words.length && filter.bikeId == null) return [...items];
  return items.filter(
    (item) =>
      (filter.bikeId == null || item.bikeId === filter.bikeId) &&
      matchesWords(historySearchText(item), words),
  );
}

const yearOf = (date: LocalDate) => Number(date.slice(0, 4));
const monthOf = (date: LocalDate) => Number(date.slice(5, 7));

export type HistoryYear = { year: number; months: number[] };

/**
 * The years and months that have entries, newest first, for the year and month lists. The
 * filter's own year and month are kept even without entries (a link to an emptied period), so
 * the lists always show what is applied.
 */
export function historyPeriods(
  entries: readonly { on: LocalDate }[],
  filter: Pick<HistoryFilter, "year" | "month">,
): HistoryYear[] {
  const months = new Map<number, Set<number>>();
  const add = (year: number, month: number | null) => {
    const set = months.get(year) ?? new Set<number>();
    if (month != null) set.add(month);
    months.set(year, set);
  };
  for (const entry of entries) add(yearOf(entry.on), monthOf(entry.on));
  if (filter.year != null) add(filter.year, filter.month);
  return [...months]
    .sort(([a], [b]) => b - a)
    .map(([year, set]) => ({ year, months: [...set].sort((a, b) => b - a) }));
}

function inPeriod(entry: Entry, filter: HistoryFilter): boolean {
  if (filter.year == null) return true;
  if (yearOf(entry.on) !== filter.year) return false;
  return filter.month == null || monthOf(entry.on) === filter.month;
}

/** The entries that match every filter, in their order. */
export function filterHistory<T extends Entry>(entries: readonly T[], filter: HistoryFilter): T[] {
  return entries.filter(
    (entry) =>
      inPeriod(entry, filter) && (!filter.kinds.length || filter.kinds.includes(entry.kind)),
  );
}

/** Entries of each kind in the filter's period, whatever kinds are chosen (the chips' counts). */
export function historyKindCounts(
  entries: readonly Entry[],
  filter: HistoryFilter,
): Record<HistoryKind, number> {
  const counts: Record<HistoryKind, number> = { ride: 0, maintenance: 0, task: 0 };
  for (const entry of entries) if (inPeriod(entry, filter)) counts[entry.kind] += 1;
  return counts;
}

/**
 * How many entries of a newest-first list to show: at least `min`, extended to the end of the
 * last month shown, so a month is never cut.
 */
export function historyShownCount(entries: readonly { on: LocalDate }[], min: number): number {
  if (entries.length <= min) return entries.length;
  const lastMonth = entries[Math.max(min, 1) - 1].on.slice(0, 7);
  let count = Math.max(min, 1);
  while (count < entries.length && entries[count].on.slice(0, 7) === lastMonth) count += 1;
  return count;
}
