import { movementTitle } from "./display";
import type { InventoryKind, MovementKind } from "./enums";
import {
  formatCount,
  formatMoney,
  formatSignedInteger,
  NBSP,
  plural,
  type LocalDate,
} from "./format";
import { historyPeriods, type HistoryYear } from "./history-filter";
import { PRODUCT_LEVEL_LABELS, UNIT_LABELS } from "./labels";
import type {
  HistoryItemVM,
  MovementVM,
  WorkshopHistoryEntryVM,
  WorkshopHistoryGroup,
} from "./view-models";

/*
 * The workshop's history (D-111): every movement of every item, archived ones included, newest
 * first. Its filters (a year, a month of that year, groups of movements, a kind of item, one
 * item) live in the address; additions of the same day read as one line; the purchases shown
 * say what they cost. Pure and client-safe: the server builds the entries, the browser filters
 * them, the MCP answers the same.
 */

export type { WorkshopHistoryGroup };

/** Display order of the groups: Achats, Utilisations, Corrections, Ajouts. */
export const WORKSHOP_HISTORY_GROUPS: readonly WorkshopHistoryGroup[] = [
  "purchase",
  "use",
  "correction",
  "added",
];

export const WORKSHOP_HISTORY_GROUP_LABELS: Record<WorkshopHistoryGroup, string> = {
  purchase: "Achats",
  use: "Utilisations",
  correction: "Corrections",
  added: "Ajouts",
};

const ITEM_KINDS: readonly InventoryKind[] = ["part", "product", "tool"];

/** A movement's group: an addition (`initial`), a purchase, a use, a correction. */
export function historyGroupOf(kind: MovementKind): WorkshopHistoryGroup {
  switch (kind) {
    case "initial":
      return "added";
    case "purchase":
      return "purchase";
    case "use":
      return "use";
    case "adjustment":
      return "correction";
  }
}

export type WorkshopHistoryFilter = {
  year: number | null;
  /** 1 to 12; only with a year. */
  month: number | null;
  /** In `WORKSHOP_HISTORY_GROUPS` order, no duplicates; empty means every group. */
  groups: WorkshopHistoryGroup[];
  itemKind: InventoryKind | null;
  /** One item alone: "Tout voir" from its page. */
  itemId: number | null;
};

export const NO_WORKSHOP_HISTORY_FILTER: WorkshopHistoryFilter = {
  year: null,
  month: null,
  groups: [],
  itemKind: null,
  itemId: null,
};

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Valid groups, deduplicated, in display order. */
export function normalizeGroups(values: readonly string[]): WorkshopHistoryGroup[] {
  return WORKSHOP_HISTORY_GROUPS.filter((group) => values.includes(group));
}

/**
 * The filter in the page's query: `?tab=history&year=2026&month=03&kind=purchase&type=tool&of=12`
 * (a comma list is read too). Invalid values are ignored; a month without a year is dropped.
 */
export function parseWorkshopHistoryFilter(query: Query): WorkshopHistoryFilter {
  const yearText = first(query.year);
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const monthText = first(query.month);
  const month =
    year != null && monthText && /^(0?[1-9]|1[0-2])$/.test(monthText) ? Number(monthText) : null;
  const kind = query.kind;
  const groups = normalizeGroups(
    (Array.isArray(kind) ? kind : kind ? [kind] : []).flatMap((value) => value.split(",")),
  );
  const type = first(query.type);
  const of = first(query.of);
  const itemId = of && /^\d+$/.test(of) && Number.isSafeInteger(Number(of)) ? Number(of) : null;
  return {
    year,
    month,
    groups,
    itemKind: ITEM_KINDS.find((value) => value === type) ?? null,
    itemId: itemId && itemId > 0 ? itemId : null,
  };
}

/** Writes the filter into `params` (null: every key removed, another tab is shown). */
export function writeWorkshopHistoryFilter(
  params: URLSearchParams,
  filter: WorkshopHistoryFilter | null,
): void {
  for (const key of ["year", "month", "kind", "type", "of"]) params.delete(key);
  if (!filter) return;
  if (filter.year != null) {
    params.set("year", String(filter.year));
    if (filter.month != null) params.set("month", String(filter.month).padStart(2, "0"));
  }
  for (const group of filter.groups) params.append("kind", group);
  if (filter.itemKind) params.set("type", filter.itemKind);
  if (filter.itemId != null) params.set("of", String(filter.itemId));
}

export function isWorkshopHistoryFiltered(filter: WorkshopHistoryFilter): boolean {
  return (
    filter.year != null ||
    filter.groups.length > 0 ||
    filter.itemKind != null ||
    filter.itemId != null
  );
}

type Entry = Pick<WorkshopHistoryEntryVM, "on" | "group" | "itemId" | "itemKind">;

const yearOf = (date: LocalDate) => Number(date.slice(0, 4));
const monthOf = (date: LocalDate) => Number(date.slice(5, 7));

function inPeriod(entry: Entry, filter: WorkshopHistoryFilter): boolean {
  if (filter.year == null) return true;
  if (yearOf(entry.on) !== filter.year) return false;
  return filter.month == null || monthOf(entry.on) === filter.month;
}

/** Everything but the groups: what the groups' counts are read in. */
function inScope(entry: Entry, filter: WorkshopHistoryFilter): boolean {
  return (
    inPeriod(entry, filter) &&
    (filter.itemKind == null || entry.itemKind === filter.itemKind) &&
    (filter.itemId == null || entry.itemId === filter.itemId)
  );
}

/** The entries that match every filter, in their order. */
export function filterWorkshopHistory<T extends Entry>(
  entries: readonly T[],
  filter: WorkshopHistoryFilter,
): T[] {
  return entries.filter(
    (entry) =>
      inScope(entry, filter) && (!filter.groups.length || filter.groups.includes(entry.group)),
  );
}

/** Entries of each group within the other filters, whatever groups are chosen (the chips). */
export function workshopHistoryGroupCounts(
  entries: readonly Entry[],
  filter: WorkshopHistoryFilter,
): Record<WorkshopHistoryGroup, number> {
  const counts: Record<WorkshopHistoryGroup, number> = {
    purchase: 0,
    use: 0,
    correction: 0,
    added: 0,
  };
  for (const entry of entries) if (inScope(entry, filter)) counts[entry.group] += 1;
  return counts;
}

/** The years and months with entries, newest first (the year and month lists, as D-78). */
export function workshopHistoryPeriods(
  entries: readonly Entry[],
  filter: WorkshopHistoryFilter,
): HistoryYear[] {
  return historyPeriods(entries, filter);
}

export type Spending = {
  /** Purchases among the entries. */
  count: number;
  /** What the priced ones cost: quantity × unit price, euro cents. */
  totalCents: number;
  /** Purchases without a price, left out of the total. */
  unpriced: number;
};

/** What the purchases among `entries` cost. */
export function spendingOf(
  entries: readonly Pick<WorkshopHistoryEntryVM, "group" | "quantityDelta" | "unitCostCents">[],
): Spending {
  let count = 0;
  let totalCents = 0;
  let unpriced = 0;
  for (const entry of entries) {
    if (entry.group !== "purchase") continue;
    count += 1;
    if (entry.unitCostCents == null) unpriced += 1;
    else totalCents += entry.unitCostCents * entry.quantityDelta;
  }
  return { count, totalCents, unpriced };
}

export type WorkshopHistoryRow<T extends Entry = WorkshopHistoryEntryVM> =
  { type: "entry"; on: LocalDate; entry: T } | { type: "additions"; on: LocalDate; entries: T[] };

/**
 * The lines shown: each entry, except that two or more additions of the same day (a workshop
 * typed in at once) read as one line, where the first of them stands.
 */
export function workshopHistoryRows<T extends Entry>(
  entries: readonly T[],
): WorkshopHistoryRow<T>[] {
  const additions = new Map<LocalDate, T[]>();
  for (const entry of entries) {
    if (entry.group !== "added") continue;
    additions.set(entry.on, [...(additions.get(entry.on) ?? []), entry]);
  }
  const rows: WorkshopHistoryRow<T>[] = [];
  const grouped = new Set<LocalDate>();
  for (const entry of entries) {
    const sameDay = entry.group === "added" ? (additions.get(entry.on) ?? []) : [];
    if (sameDay.length < 2) {
      rows.push({ type: "entry", on: entry.on, entry });
    } else if (!grouped.has(entry.on)) {
      grouped.add(entry.on);
      rows.push({ type: "additions", on: entry.on, entries: sameDay });
    }
  }
  return rows;
}

/**
 * The link a purchase goes through when nothing is said (D-42, D-111): the cheapest priced one,
 * else the first.
 */
export function defaultPurchaseLink<T extends { id: number; priceCents: number | null }>(
  links: readonly T[],
): T | null {
  const priced = links
    .filter((link) => link.priceCents != null)
    .sort((a, b) => a.priceCents! - b.priceCents!);
  return priced[0] ?? links[0] ?? null;
}

type ItemWords = Pick<HistoryItemVM, "kind" | "unit" | "container">;

/** "2 paires", "1 flacon"; nothing for a tool (one at a time). */
function countOf(item: ItemWords, count: number): string | null {
  if (item.kind === "part") return formatCount(count, ...UNIT_LABELS[item.unit ?? "piece"]);
  if (item.kind === "product")
    return formatCount(count, ...(item.container ?? ["flacon", "flacons"]));
  return null;
}

/** "−2 paires", "+1 flacon". */
function signedCountOf(item: ItemWords, delta: number): string {
  const words =
    item.kind === "part"
      ? UNIT_LABELS[item.unit ?? "piece"]
      : (item.container ?? (["flacon", "flacons"] as const));
  return `${formatSignedInteger(delta)}${NBSP}${plural(delta, ...words)}`;
}

const level = (value: NonNullable<MovementVM["levelAfter"]>) =>
  PRODUCT_LEVEL_LABELS[value].toLowerCase();

/** "2 paires à 24,90 €", "89,00 €" (a tool), "2 flacons", or null for a tool without a price. */
export function purchaseFigures(
  item: ItemWords,
  movement: Pick<MovementVM, "quantityDelta" | "unitCostCents">,
): string | null {
  const count = countOf(item, movement.quantityDelta);
  const price = movement.unitCostCents != null ? formatMoney(movement.unitCostCents) : null;
  if (!count) return price;
  return price ? `${count} à ${price}` : count;
}

/**
 * What a movement did, in words (D-111): "Achat · 2 paires à 24,90 € · Alltricks", "Utilisé ·
 * 1 paire · Spectral", "Niveau : entamé → presque vide", "Stock corrigé · −2 paires", "Ajouté à
 * l'atelier · 3 paires"; a tool "Dans l'atelier" or "Plus dans l'atelier".
 */
export function movementSummary(
  item: ItemWords,
  movement: Pick<
    MovementVM,
    "kind" | "quantityDelta" | "levelAfter" | "levelBefore" | "unitCostCents" | "source"
  >,
): string {
  const parts: (string | null)[] = [];
  const { kind, quantityDelta: delta } = movement;
  const levelChange =
    item.kind === "product" && delta === 0 && movement.levelAfter
      ? movement.levelBefore && movement.levelBefore !== movement.levelAfter
        ? `${level(movement.levelBefore)} → ${level(movement.levelAfter)}`
        : level(movement.levelAfter)
      : null;
  switch (kind) {
    case "initial":
      parts.push("Ajouté à l'atelier", countOf(item, delta));
      break;
    case "purchase":
      parts.push("Achat", purchaseFigures(item, movement), movement.source);
      break;
    case "use":
      if (levelChange) parts.push(`Niveau : ${levelChange}`);
      else if (item.kind === "product")
        parts.push(movementTitle("product", movement, item.container ?? undefined));
      else parts.push("Utilisé", countOf(item, -delta));
      parts.push(movement.source);
      break;
    case "adjustment":
      if (item.kind === "tool") parts.push(movementTitle("tool", movement));
      else if (levelChange) parts.push(`Niveau corrigé : ${levelChange}`);
      else parts.push("Stock corrigé", signedCountOf(item, delta));
      break;
  }
  return parts.filter(Boolean).join(" · ");
}
