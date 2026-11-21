"use client";

import * as React from "react";
import { Bike, Check, Search, Wrench, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount, ChipRow } from "@/components/ui/chip";
import { Input, NativeSelect } from "@/components/ui/field";
import { replaceQuery } from "@/lib/address";
import { formatCount, formatInteger, formatMonthName, type LocalDate } from "@/lib/format";
import {
  filterHistory,
  HISTORY_KINDS,
  HISTORY_PAGE_SIZE,
  historyKindCounts,
  historyPeriods,
  historyShownCount,
  isHistoryFiltered,
  NO_HISTORY_FILTER,
  normalizeKinds,
  searchHistory,
  writeHistoryFilter,
  type HistoryFilter,
  type HistoryKind,
} from "@/lib/history-filter";
import type { TimelineItemVM } from "@/lib/view-models";

/*
 * A history with its filters (D-78): a search and, on Activité, a bike (D-112); year, month of
 * that year, kinds of entry; all kept in the address. Shows HISTORY_PAGE_SIZE entries (whole
 * months), then "Voir plus". The view models' entries are all there: filtering happens in the
 * browser, without a request.
 */

const KIND_CHIPS: Record<HistoryKind, { label: string; icon: React.ElementType }> = {
  ride: { label: "Sorties", icon: Bike },
  maintenance: { label: "Entretiens", icon: Wrench },
  task: { label: "Tâches faites", icon: Check },
};

export type HistoryState = ReturnType<typeof useHistoryFilter>;

/** A bike of Activité's list (D-112). */
export type HistoryBikeOption = { id: number; name: string };

/** The filter, applied to `items` (newest first), and what the page shows of it. */
export function useHistoryFilter(items: TimelineItemVM[], initial: HistoryFilter) {
  const [filter, setFilterState] = React.useState(initial);
  const [min, setMin] = React.useState(HISTORY_PAGE_SIZE);
  const { query, bikeId } = filter;
  // The search and the bike first: the period lists and the chips count what they found.
  const found = React.useMemo(
    () => searchHistory(items, { query, bikeId }),
    [items, query, bikeId],
  );
  const matching = React.useMemo(() => filterHistory(found, filter), [found, filter]);
  const shownCount = historyShownCount(matching, min);

  const setFilter = (next: HistoryFilter) => {
    setFilterState(next);
    setMin(HISTORY_PAGE_SIZE);
    replaceQuery((params) => writeHistoryFilter(params, next));
  };

  return {
    items,
    filter,
    setFilter,
    found,
    matching,
    shown: matching.slice(0, shownCount),
    more: () => setMin(shownCount + HISTORY_PAGE_SIZE),
    /** Makes an entry visible: clears the filters if they hide it, shows enough entries. */
    reveal: (kind: HistoryKind, id: number) => {
      const isIt = (item: TimelineItemVM) => item.kind === kind && item.id === id;
      let index = matching.findIndex(isIt);
      if (index < 0) {
        index = items.findIndex(isIt);
        if (index < 0) return;
        setFilter(NO_HISTORY_FILTER);
      }
      setMin(Math.max(HISTORY_PAGE_SIZE, index + 1));
    },
  };
}

function HistoryFilterBar({
  history,
  bikes,
}: {
  history: HistoryState;
  bikes?: HistoryBikeOption[];
}) {
  const { filter, setFilter, found, matching } = history;
  const periods = historyPeriods(found, filter);
  const months = periods.find((period) => period.year === filter.year)?.months ?? [];
  const counts = historyKindCounts(found, filter);
  const toggle = (kind: HistoryKind, on: boolean) =>
    setFilter({
      ...filter,
      kinds: normalizeKinds(on ? [...filter.kinds, kind] : filter.kinds.filter((k) => k !== kind)),
    });
  // The bike list once there is a choice; a bike in the address stays listed (D-112).
  const bikeChoice = bikes && (bikes.length > 1 || filter.bikeId != null) ? bikes : null;

  return (
    <div className="mb-4 grid gap-3">
      <div className="flex flex-wrap gap-2 [&>*:first-child]:min-w-[min(100%,12rem)] [&>*:first-child]:flex-1">
        <Input
          type="search"
          aria-label="Rechercher dans l'historique"
          placeholder={bikeChoice ? "Titre, lieu, note, pièce, vélo…" : "Titre, lieu, note, pièce…"}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          icon={<Search />}
          value={filter.query}
          onChange={(event) => setFilter({ ...filter, query: event.target.value })}
        />
        {bikeChoice ? (
          <NativeSelect
            aria-label="Filtrer par vélo"
            value={filter.bikeId ?? ""}
            onChange={(event) =>
              setFilter({
                ...filter,
                bikeId: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">Tous les vélos</option>
            {bikeChoice.map((bike) => (
              <option key={bike.id} value={bike.id}>
                {bike.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <div className="grid gap-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-4">
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <NativeSelect
            aria-label="Année"
            className="lg:w-48"
            value={filter.year ?? ""}
            onChange={(event) =>
              setFilter({
                ...filter,
                year: event.target.value ? Number(event.target.value) : null,
                month: null,
              })
            }
          >
            {/* Short enough for half a phone screen. */}
            <option value="">Toutes années</option>
            {periods.map(({ year }) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Mois"
            className="lg:w-48"
            disabled={filter.year == null}
            value={filter.month ?? ""}
            onChange={(event) =>
              setFilter({
                ...filter,
                month: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">Tous les mois</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonthName(month)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Types d&apos;entrée</legend>
          <ChipRow scroll className="-mx-4 px-4 md:mx-0 md:flex-wrap md:px-0">
            {HISTORY_KINDS.map((kind) => {
              const { label, icon: Icon } = KIND_CHIPS[kind];
              return (
                <Chip
                  key={kind}
                  type="checkbox"
                  value={kind}
                  checked={filter.kinds.includes(kind)}
                  onChange={(event) => toggle(kind, event.target.checked)}
                >
                  <Icon aria-hidden />
                  {label} <ChipCount>{counts[kind]}</ChipCount>
                </Chip>
              );
            })}
          </ChipRow>
        </fieldset>
        <div className="flex min-h-[34px] items-center justify-between gap-3 lg:ml-auto">
          <p role="status" className="text-[13px] text-fg-muted">
            {formatCount(matching.length, "entrée", "entrées")}
          </p>
          {/* With no match, the empty state below carries the button. */}
          {isHistoryFiltered(filter) && matching.length ? (
            <Button variant="ghost" size="sm" onClick={() => setFilter(NO_HISTORY_FILTER)}>
              <X />
              Effacer les filtres
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The filter bar, then the entries by month, "Voir plus", or why nothing shows. */
export function FilteredHistory({
  history,
  today,
  withBike = false,
  bikes,
  addPhotos,
  onEdit,
}: {
  history: HistoryState;
  today: LocalDate;
  withBike?: boolean;
  /** Activité's bike list (D-112); shown from two bikes. */
  bikes?: HistoryBikeOption[];
  addPhotos?: (item: TimelineItemVM) => React.ReactNode;
  onEdit?: (item: TimelineItemVM) => void;
}) {
  const { items, matching, shown } = history;
  if (!items.length) {
    return (
      <Card padded>
        <Timeline items={items} today={today} />
      </Card>
    );
  }
  return (
    <>
      <HistoryFilterBar history={history} bikes={bikes} />
      {matching.length ? (
        <Card padded>
          <Timeline
            items={shown}
            today={today}
            withBike={withBike}
            groupByMonth
            onEdit={onEdit}
            addPhotos={addPhotos}
          />
          {shown.length < matching.length ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-[13px] text-fg-muted">
                {formatInteger(shown.length)} sur{" "}
                {formatCount(matching.length, "entrée", "entrées")}
              </span>
              <Button variant="secondary" size="sm" onClick={history.more}>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => history.setFilter(NO_HISTORY_FILTER)}
            >
              <X />
              Effacer les filtres
            </Button>
          }
        >
          {history.filter.query.trim()
            ? "Essaie d'autres mots, une autre période ou un autre type d'entrée."
            : "Essaie une autre période ou un autre type d'entrée."}
        </EmptyState>
      )}
    </>
  );
}
