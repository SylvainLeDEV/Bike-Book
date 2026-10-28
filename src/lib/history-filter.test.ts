import { describe, expect, it } from "vitest";
import { parseBikeTab, writeBikeTab } from "./bike-tabs";
import {
  filterHistory,
  historyKindCounts,
  historyPeriods,
  historyShownCount,
  isHistoryFiltered,
  NO_HISTORY_FILTER,
  normalizeKinds,
  parseHistoryFilter,
  writeHistoryFilter,
  type HistoryFilter,
  type HistoryKind,
} from "./history-filter";

const entry = (kind: HistoryKind, on: string) => ({ kind, on });

// Newest first, as the timelines are.
const HISTORY = [
  entry("ride", "2026-10-24"),
  entry("task", "2026-10-20"),
  entry("maintenance", "2026-10-12"),
  entry("ride", "2026-09-30"),
  entry("ride", "2026-03-02"),
  entry("maintenance", "2025-12-31"),
  entry("ride", "2025-01-01"),
  entry("ride", "2024-06-15"),
];

const filter = (overrides: Partial<HistoryFilter>): HistoryFilter => ({
  ...NO_HISTORY_FILTER,
  ...overrides,
});

describe("history filter in the address", () => {
  it("reads year, month and kinds", () => {
    expect(
      parseHistoryFilter({ year: "2026", month: "10", kind: ["task", "maintenance"] }),
    ).toEqual({ year: 2026, month: 10, kinds: ["maintenance", "task"] });
    expect(parseHistoryFilter({ year: "2026", month: "3" })).toEqual(
      filter({ year: 2026, month: 3 }),
    );
    // A comma list, typed by hand, is read too.
    expect(parseHistoryFilter({ kind: "ride,task" }).kinds).toEqual(["ride", "task"]);
    expect(parseHistoryFilter({})).toEqual(NO_HISTORY_FILTER);
  });

  it("ignores invalid values, and a month without a year", () => {
    expect(parseHistoryFilter({ year: "26", month: "10" })).toEqual(NO_HISTORY_FILTER);
    expect(parseHistoryFilter({ month: "10" })).toEqual(NO_HISTORY_FILTER);
    expect(parseHistoryFilter({ year: "2026", month: "13" })).toEqual(filter({ year: 2026 }));
    expect(parseHistoryFilter({ year: "2026", month: "0" })).toEqual(filter({ year: 2026 }));
    expect(parseHistoryFilter({ kind: ["bike", "ride", "ride"] }).kinds).toEqual(["ride"]);
    // A repeated year: the first one.
    expect(parseHistoryFilter({ year: ["2025", "2026"] }).year).toBe(2025);
  });

  it("writes the filter and keeps the other parameters", () => {
    const params = new URLSearchParams("tab=history&year=2024&kind=ride&event=4");
    writeHistoryFilter(params, filter({ year: 2026, month: 3, kinds: ["maintenance", "task"] }));
    expect(params.toString()).toBe(
      "tab=history&event=4&year=2026&month=03&kind=maintenance&kind=task",
    );
    writeHistoryFilter(params, NO_HISTORY_FILTER);
    expect(params.toString()).toBe("tab=history&event=4");
  });

  it("reads back what it writes", () => {
    const original = filter({ year: 2025, month: 12, kinds: ["ride"] });
    const params = new URLSearchParams();
    writeHistoryFilter(params, original);
    const query: Record<string, string[]> = {};
    for (const [key, value] of params) (query[key] ??= []).push(value);
    expect(parseHistoryFilter(query)).toEqual(original);
  });

  it("knows when something is filtered", () => {
    expect(isHistoryFiltered(NO_HISTORY_FILTER)).toBe(false);
    expect(isHistoryFiltered(filter({ year: 2026 }))).toBe(true);
    expect(isHistoryFiltered(filter({ kinds: ["task"] }))).toBe(true);
  });

  it("orders the kinds for display", () => {
    expect(normalizeKinds(["task", "ride", "task"])).toEqual(["ride", "task"]);
  });
});

describe("history periods", () => {
  it("lists the years and their months, newest first", () => {
    expect(historyPeriods(HISTORY, NO_HISTORY_FILTER)).toEqual([
      { year: 2026, months: [10, 9, 3] },
      { year: 2025, months: [12, 1] },
      { year: 2024, months: [6] },
    ]);
    expect(historyPeriods([], NO_HISTORY_FILTER)).toEqual([]);
  });

  it("keeps the chosen year and month even without entries", () => {
    expect(historyPeriods(HISTORY, filter({ year: 2026, month: 5 }))[0]).toEqual({
      year: 2026,
      months: [10, 9, 5, 3],
    });
    expect(historyPeriods(HISTORY, filter({ year: 2021 })).at(-1)).toEqual({
      year: 2021,
      months: [],
    });
  });
});

describe("filtering a history", () => {
  it("filters by year, then month, keeping the order", () => {
    expect(filterHistory(HISTORY, filter({ year: 2025 }))).toEqual([
      entry("maintenance", "2025-12-31"),
      entry("ride", "2025-01-01"),
    ]);
    expect(filterHistory(HISTORY, filter({ year: 2026, month: 10 })).map((e) => e.on)).toEqual([
      "2026-10-24",
      "2026-10-20",
      "2026-10-12",
    ]);
    expect(filterHistory(HISTORY, NO_HISTORY_FILTER)).toEqual(HISTORY);
  });

  it("filters by kinds, several at once", () => {
    expect(filterHistory(HISTORY, filter({ kinds: ["maintenance", "task"] }))).toEqual([
      entry("task", "2026-10-20"),
      entry("maintenance", "2026-10-12"),
      entry("maintenance", "2025-12-31"),
    ]);
  });

  it("combines period and kinds, down to nothing", () => {
    expect(filterHistory(HISTORY, filter({ year: 2026, kinds: ["maintenance"] }))).toEqual([
      entry("maintenance", "2026-10-12"),
    ]);
    expect(filterHistory(HISTORY, filter({ year: 2024, kinds: ["task"] }))).toEqual([]);
  });

  it("counts each kind in the period, whatever kinds are chosen", () => {
    expect(historyKindCounts(HISTORY, NO_HISTORY_FILTER)).toEqual({
      ride: 5,
      maintenance: 2,
      task: 1,
    });
    expect(historyKindCounts(HISTORY, filter({ year: 2026, month: 10, kinds: ["ride"] }))).toEqual({
      ride: 1,
      maintenance: 1,
      task: 1,
    });
  });
});

describe("how many entries to show", () => {
  it("shows everything under the minimum", () => {
    expect(historyShownCount(HISTORY, 50)).toBe(HISTORY.length);
    expect(historyShownCount([], 50)).toBe(0);
  });

  it("never cuts a month", () => {
    // The 2nd entry is in October 2026, which has three: all three show.
    expect(historyShownCount(HISTORY, 2)).toBe(3);
    // The 3rd ends October: no more.
    expect(historyShownCount(HISTORY, 3)).toBe(3);
    expect(historyShownCount(HISTORY, 4)).toBe(4);
  });
});

describe("bike page tab in the address", () => {
  it("reads the tab, the first one by default", () => {
    expect(parseBikeTab("history")).toBe("history");
    expect(parseBikeTab(["photos", "record"])).toBe("photos");
    expect(parseBikeTab("overview")).toBe("plan");
    expect(parseBikeTab(undefined)).toBe("plan");
  });

  it("leaves the first tab out of the address", () => {
    const params = new URLSearchParams("tab=history&year=2026");
    writeBikeTab(params, "plan");
    expect(params.toString()).toBe("year=2026");
    writeBikeTab(params, "record");
    expect(params.toString()).toBe("year=2026&tab=record");
  });
});
