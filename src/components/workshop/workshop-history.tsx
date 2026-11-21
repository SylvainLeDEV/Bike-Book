"use client";

import * as React from "react";
import { cn } from "cn";
import { ChevronRight, PackagePlus, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { KIND_ICONS } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount, ChipRow } from "@/components/ui/chip";
import { NativeSelect } from "@/components/ui/field";
import {
  formatCount,
  formatDate,
  formatInteger,
  formatMoney,
  formatMonthName,
  formatMonthYear,
  type LocalDate,
} from "@/lib/format";
import { HISTORY_PAGE_SIZE, historyShownCount } from "@/lib/history-filter";
import type {
  HistoryItemVM,
  InventoryKind,
  WorkshopHistoryEntryVM,
  WorkshopHistoryVM,
} from "@/lib/view-models";
import {
  filterWorkshopHistory,
  isWorkshopHistoryFiltered,
  movementSummary,
  normalizeGroups,
  spendingOf,
  WORKSHOP_HISTORY_GROUP_LABELS,
  WORKSHOP_HISTORY_GROUPS,
  workshopHistoryGroupCounts,
  workshopHistoryPeriods,
  workshopHistoryRows,
  type WorkshopHistoryFilter,
  type WorkshopHistoryGroup,
  type WorkshopHistoryRow,
} from "@/lib/workshop-history";

/*
 * The Atelier's "Historique" tab (D-111): every movement of every item, archived ones included,
 * newest first by month, with the bike history's filters (D-78: year, month, groups) plus a kind
 * of item and one item ("Tout voir" from its page). The Atelier's search and bike filter apply
 * too. Additions of the same day read as one line; the purchases shown say what they cost. An
 * entry opens "Modifier le mouvement".
 */

const ITEM_KIND_OPTIONS: [InventoryKind, string][] = [
  ["part", "Pièces"],
  ["product", "Produits"],
  ["tool", "Outils"],
];

const GROUP_STYLES: Record<WorkshopHistoryGroup, string> = {
  purchase: "bg-brand-soft text-brand-ink",
  use: "bg-surface-2 text-fg-muted",
  correction: "bg-surface-2 text-fg-muted",
  added: "bg-ok-soft text-ok-ink",
};

/** Accents and case ignored, as the Atelier's search. */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The entries the Atelier's search and bike filter keep: the item's name and words match; the
 * item serves the bike, or the movement was a use on it.
 */
export function historyEntriesFor(
  history: WorkshopHistoryVM,
  query: string,
  bikeId: number | null,
): WorkshopHistoryEntryVM[] {
  const q = normalize(query.trim());
  const items = new Map(history.items.map((item) => [item.id, item]));
  return history.entries.filter((entry) => {
    const item = items.get(entry.itemId);
    if (!item) return false;
    if (
      bikeId != null &&
      item.bikes !== "all" &&
      !item.bikes.includes(bikeId) &&
      entry.maintenance?.bikeId !== bikeId
    ) {
      return false;
    }
    return !q || normalize(`${item.name} ${item.searchText}`).includes(q);
  });
}

export function WorkshopHistory({
  history,
  entries,
  filter,
  onFilterChange,
  onClearAll,
  outerFiltered,
  today,
  onOpen,
}: {
  history: WorkshopHistoryVM;
  /** The entries the Atelier's search and bike filter keep (`historyEntriesFor`). */
  entries: WorkshopHistoryEntryVM[];
  filter: WorkshopHistoryFilter;
  onFilterChange: (filter: WorkshopHistoryFilter) => void;
  /** Clears these filters and the Atelier's search and bike. */
  onClearAll: () => void;
  /** The Atelier's search or bike filter is set. */
  outerFiltered: boolean;
  today: LocalDate;
  onOpen: (entry: WorkshopHistoryEntryVM) => void;
}) {
  const [min, setMin] = React.useState(HISTORY_PAGE_SIZE);
  const items = React.useMemo(
    () => new Map(history.items.map((item) => [item.id, item])),
    [history.items],
  );
  const matching = React.useMemo(() => filterWorkshopHistory(entries, filter), [entries, filter]);
  const rows = React.useMemo(() => workshopHistoryRows(matching), [matching]);
  const shown = rows.slice(0, historyShownCount(rows, min));
  const setFilter = (next: WorkshopHistoryFilter) => {
    setMin(HISTORY_PAGE_SIZE);
    onFilterChange(next);
  };

  if (!history.entries.length) {
    return (
      <EmptyState compact title="Aucun mouvement pour l'instant">
        Les achats, utilisations et corrections de stock de l&apos;atelier arriveront ici, du plus
        récent au plus ancien.
      </EmptyState>
    );
  }

  const filtered = isWorkshopHistoryFiltered(filter) || outerFiltered;
  return (
    <>
      <FilterBar
        entries={entries}
        matching={matching}
        filter={filter}
        setFilter={setFilter}
        item={filter.itemId != null ? (items.get(filter.itemId) ?? null) : null}
        onClearAll={filtered && matching.length ? onClearAll : null}
      />
      {matching.length ? (
        <Card padded>
          <MonthList rows={shown} items={items} today={today} onOpen={onOpen} />
          {shown.length < rows.length ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-[13px] text-fg-muted">
                {formatInteger(shown.length)} sur {formatCount(rows.length, "ligne", "lignes")}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMin(shown.length + HISTORY_PAGE_SIZE)}
              >
                Voir plus
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          compact
          title="Aucune entrée ne correspond"
          action={
            <Button variant="secondary" size="sm" onClick={onClearAll}>
              <X />
              Effacer les filtres
            </Button>
          }
        >
          Essaie une autre période, un autre type d&apos;entrée ou un autre objet.
        </EmptyState>
      )}
    </>
  );
}

function FilterBar({
  entries,
  matching,
  filter,
  setFilter,
  item,
  onClearAll,
}: {
  entries: WorkshopHistoryEntryVM[];
  matching: WorkshopHistoryEntryVM[];
  filter: WorkshopHistoryFilter;
  setFilter: (filter: WorkshopHistoryFilter) => void;
  item: HistoryItemVM | null;
  onClearAll: (() => void) | null;
}) {
  const periods = workshopHistoryPeriods(entries, filter);
  const months = periods.find((period) => period.year === filter.year)?.months ?? [];
  const counts = workshopHistoryGroupCounts(entries, filter);
  const spending = spendingOf(matching);
  const toggle = (group: WorkshopHistoryGroup, on: boolean) =>
    setFilter({
      ...filter,
      groups: normalizeGroups(
        on ? [...filter.groups, group] : filter.groups.filter((g) => g !== group),
      ),
    });

  return (
    <div className="mb-4 grid gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <NativeSelect
          aria-label="Année"
          value={filter.year ?? ""}
          onChange={(event) =>
            setFilter({
              ...filter,
              year: event.target.value ? Number(event.target.value) : null,
              month: null,
            })
          }
        >
          <option value="">Toutes années</option>
          {periods.map(({ year }) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Mois"
          disabled={filter.year == null}
          value={filter.month ?? ""}
          onChange={(event) =>
            setFilter({ ...filter, month: event.target.value ? Number(event.target.value) : null })
          }
        >
          <option value="">Tous les mois</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonthName(month)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Type d'objet"
          className="col-span-2 md:col-span-1"
          value={filter.itemKind ?? ""}
          onChange={(event) =>
            setFilter({
              ...filter,
              itemKind: (event.target.value || null) as InventoryKind | null,
            })
          }
        >
          <option value="">Pièces, produits et outils</option>
          {ITEM_KIND_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Types de mouvement</legend>
        <ChipRow scroll className="-mx-4 px-4 md:mx-0 md:flex-wrap md:px-0">
          {WORKSHOP_HISTORY_GROUPS.map((group) => (
            <Chip
              key={group}
              type="checkbox"
              value={group}
              checked={filter.groups.includes(group)}
              onChange={(event) => toggle(group, event.target.checked)}
            >
              {WORKSHOP_HISTORY_GROUP_LABELS[group]} <ChipCount>{counts[group]}</ChipCount>
            </Chip>
          ))}
        </ChipRow>
      </fieldset>
      {item ? (
        <div>
          <button
            type="button"
            onClick={() => setFilter({ ...filter, itemId: null })}
            className="inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-brand bg-brand-soft pr-2.5 pl-3.5 text-sm font-semibold text-brand-ink pointer-coarse:h-11"
          >
            <span className="truncate">{item.name}</span>
            <X className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">, voir tout l&apos;atelier</span>
          </button>
        </div>
      ) : null}
      <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p role="status" className="text-[13px] text-fg-muted">
          {formatCount(matching.length, "entrée", "entrées")}
          {spending.count ? (
            <>
              {" · "}
              <b className="font-semibold text-fg">{formatMoney(spending.totalCents)}</b> pour{" "}
              {formatCount(spending.count, "achat", "achats")}
              {spending.unpriced
                ? ` (dont ${formatCount(spending.unpriced, "sans prix", "sans prix")})`
                : ""}
            </>
          ) : null}
        </p>
        {onClearAll ? (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            <X />
            Effacer les filtres
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MonthList({
  rows,
  items,
  today,
  onOpen,
}: {
  rows: WorkshopHistoryRow[];
  items: Map<number, HistoryItemVM>;
  today: LocalDate;
  onOpen: (entry: WorkshopHistoryEntryVM) => void;
}) {
  const months: { key: string; rows: WorkshopHistoryRow[] }[] = [];
  for (const row of rows) {
    const key = row.on.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.rows.push(row);
    else months.push({ key, rows: [row] });
  }
  return (
    <div>
      {months.map((month, index) => (
        <section key={month.key}>
          <h3 className={cn("mb-1 eyebrow", index > 0 && "mt-[18px]")}>
            {formatMonthYear(`${month.key}-01`)}
          </h3>
          <ol className="m-0 list-none divide-y divide-border p-0">
            {month.rows.map((row) =>
              row.type === "entry" ? (
                <EntryRow
                  key={row.entry.id}
                  entry={row.entry}
                  item={items.get(row.entry.itemId)!}
                  today={today}
                  onOpen={onOpen}
                />
              ) : (
                <AdditionsRow
                  key={`added-${row.on}`}
                  on={row.on}
                  entries={row.entries}
                  items={items}
                  today={today}
                  onOpen={onOpen}
                />
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}

const rowButton =
  "group grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left text-inherit focus-visible:-outline-offset-2";

function EntryRow({
  entry,
  item,
  today,
  onOpen,
}: {
  entry: WorkshopHistoryEntryVM;
  item: HistoryItemVM;
  today: LocalDate;
  onOpen: (entry: WorkshopHistoryEntryVM) => void;
}) {
  const Icon = KIND_ICONS[item.kind];
  return (
    <li>
      <button type="button" className={rowButton} onClick={() => onOpen(entry)}>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full [&_svg]:size-[18px]",
            GROUP_STYLES[entry.group],
          )}
        >
          <Icon aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
            <b className="font-semibold text-fg">
              {formatDate(entry.on, { month: "short", year: "auto", today })}
            </b>
            {item.archived ? <span>· archivé</span> : null}
          </span>
          <span className="block text-[15px] leading-[1.35] font-semibold group-hover:underline group-hover:underline-offset-3">
            {item.name}
          </span>
          <span className="block text-[13.5px] leading-[1.4]">{movementSummary(item, entry)}</span>
          {entry.maintenance || entry.detail ? (
            <span className="block text-[13px] text-fg-muted">
              {[entry.maintenance?.title, entry.detail].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <ChevronRight className="size-[18px] text-fg-muted group-hover:text-fg" aria-hidden />
      </button>
    </li>
  );
}

/** Additions of one day (a workshop typed in at once): one line that opens on them. */
function AdditionsRow({
  on,
  entries,
  items,
  today,
  onOpen,
}: {
  on: LocalDate;
  entries: WorkshopHistoryEntryVM[];
  items: Map<number, HistoryItemVM>;
  today: LocalDate;
  onOpen: (entry: WorkshopHistoryEntryVM) => void;
}) {
  return (
    <li>
      <details className="group/additions">
        <summary
          className={cn(rowButton, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
        >
          <span
            className={cn(
              "grid size-9 place-items-center rounded-full [&_svg]:size-[18px]",
              GROUP_STYLES.added,
            )}
          >
            <PackagePlus aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] text-fg-muted">
              <b className="font-semibold text-fg">
                {formatDate(on, { month: "short", year: "auto", today })}
              </b>
            </span>
            <span className="block text-[15px] leading-[1.35] font-semibold">
              {formatCount(entries.length, "objet ajouté", "objets ajoutés")} à l&apos;atelier
            </span>
            <span className="block text-[13px] text-fg-muted">
              Touche pour les voir ; un ajout peut être noté comme un achat.
            </span>
          </span>
          <ChevronRight
            className="size-[18px] text-fg-muted transition-transform group-open/additions:rotate-90"
            aria-hidden
          />
        </summary>
        <ul className="m-0 mb-2 ml-12 list-none divide-y divide-border rounded-xl border border-border p-0">
          {entries.map((entry) => {
            const item = items.get(entry.itemId)!;
            const Icon = KIND_ICONS[item.kind];
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="group flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-inherit focus-visible:-outline-offset-2"
                >
                  <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold group-hover:underline group-hover:underline-offset-3">
                      {item.name}
                      {item.archived ? (
                        <span className="font-normal text-fg-muted"> · archivé</span>
                      ) : null}
                    </span>
                    <span className="block text-[13px] text-fg-muted">
                      {movementSummary(item, entry)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-fg-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}
