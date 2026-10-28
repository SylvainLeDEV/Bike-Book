"use client";

import * as React from "react";
import { Bike, Check, Wrench, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount, ChipRow } from "@/components/ui/chip";
import { NativeSelect } from "@/components/ui/field";
import { replaceQuery } from "@/lib/bike-tabs";
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
  writeHistoryFilter,
  type HistoryFilter,
  type HistoryKind,
} from "@/lib/history-filter";
import type { TimelineItemVM } from "@/lib/view-models";

/*
 * A history with its filters (D-78): year, month of that year, kinds of entry, kept in the
 * address. Shows HISTORY_PAGE_SIZE entries (whole months), then "Voir plus". The view models'
 * entries are all there: filtering happens in the browser, without a request.
 */

const KIND_CHIPS: Record<HistoryKind, { label: string; icon: React.ElementType }> = {
  ride: { label: "Sorties", icon: Bike },
  maintenance: { label: "Entretiens", icon: Wrench },
  task: { label: "Tâches faites", icon: Check },
};

export type HistoryState = ReturnType<typeof useHistoryFilter>;

/** The filter, applied to `items` (newest first), and what the page shows of it. */
export function useHistoryFilter(items: TimelineItemVM[], initial: HistoryFilter) {
  const [filter, setFilterState] = React.useState(initial);
  const [min, setMin] = React.useState(HISTORY_PAGE_SIZE);
  const matching = React.useMemo(() => filterHistory(items, filter), [items, filter]);
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

function HistoryFilterBar({ history }: { history: HistoryState }) {
  const { items, filter, setFilter, matching } = history;
  const periods = historyPeriods(items, filter);
  const months = periods.find((period) => period.year === filter.year)?.months ?? [];
  const counts = historyKindCounts(items, filter);
  const toggle = (kind: HistoryKind, on: boolean) =>
    setFilter({
      ...filter,
      kinds: normalizeKinds(on ? [...filter.kinds, kind] : filter.kinds.filter((k) => k !== kind)),
    });

  return (
    <div className="mb-4 grid gap-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-4">
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
  );
}

/** The filter bar, then the entries by month, "Voir plus", or why nothing shows. */
export function FilteredHistory({
  history,
  today,
  withBike = false,
  addPhotos,
  onEdit,
}: {
  history: HistoryState;
  today: LocalDate;
  withBike?: boolean;
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
      <HistoryFilterBar history={history} />
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
          Essaie une autre période ou un autre type d&apos;entrée.
        </EmptyState>
      )}
    </>
  );
}
