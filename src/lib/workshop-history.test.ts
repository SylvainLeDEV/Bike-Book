import { describe, expect, it } from "vitest";
import { NBSP } from "./format";
import type { HistoryItemVM, WorkshopHistoryEntryVM } from "./view-models";
import {
  defaultPurchaseLink,
  filterWorkshopHistory,
  historyGroupOf,
  movementSummary,
  NO_WORKSHOP_HISTORY_FILTER,
  parseWorkshopHistoryFilter,
  spendingOf,
  workshopHistoryGroupCounts,
  workshopHistoryPeriods,
  workshopHistoryRows,
  writeWorkshopHistoryFilter,
} from "./workshop-history";

/** French spaces typed as "~" (no-break) in the expectations. */
const fr = (text: string) => text.replaceAll("~", NBSP);

let nextId = 1;
const entry = (fields: Partial<WorkshopHistoryEntryVM>): WorkshopHistoryEntryVM => {
  const kind = fields.kind ?? "purchase";
  const on = fields.on ?? "2026-03-12";
  return {
    id: nextId++,
    kind,
    quantityDelta: 1,
    occurredOn: on,
    source: null,
    detail: null,
    maintenance: null,
    itemId: 1,
    itemKind: "part",
    on,
    group: historyGroupOf(kind),
    ...fields,
  };
};

const pads: Pick<HistoryItemVM, "kind" | "unit" | "container"> = {
  kind: "part",
  unit: "pair",
  container: null,
};
const oil: Pick<HistoryItemVM, "kind" | "unit" | "container"> = {
  kind: "product",
  unit: null,
  container: ["flacon", "flacons"],
};
const wrench: Pick<HistoryItemVM, "kind" | "unit" | "container"> = {
  kind: "tool",
  unit: null,
  container: null,
};

describe("workshop history filter (D-111)", () => {
  it("reads and writes the address, ignoring what is invalid", () => {
    expect(
      parseWorkshopHistoryFilter({
        tab: "history",
        year: "2026",
        month: "3",
        kind: ["use", "purchase,nope"],
        type: "tool",
        of: "12",
      }),
    ).toEqual({ year: 2026, month: 3, groups: ["purchase", "use"], itemKind: "tool", itemId: 12 });
    expect(parseWorkshopHistoryFilter({ month: "3", type: "bike", of: "0" })).toEqual(
      NO_WORKSHOP_HISTORY_FILTER,
    );

    const params = new URLSearchParams("tab=history&q=huile&year=2025");
    writeWorkshopHistoryFilter(params, {
      year: 2026,
      month: 3,
      groups: ["purchase", "added"],
      itemKind: "product",
      itemId: 7,
    });
    expect(params.toString()).toBe(
      "tab=history&q=huile&year=2026&month=03&kind=purchase&kind=added&type=product&of=7",
    );
    writeWorkshopHistoryFilter(params, null);
    expect(params.toString()).toBe("tab=history&q=huile");
  });

  it("filters by period, group, kind of item and item; counts the groups in the rest", () => {
    const entries = [
      entry({ on: "2026-03-12", kind: "purchase", itemId: 1 }),
      entry({ on: "2026-03-02", kind: "use", quantityDelta: -1, itemId: 1 }),
      entry({
        on: "2026-02-20",
        kind: "adjustment",
        quantityDelta: 2,
        itemId: 2,
        itemKind: "product",
      }),
      entry({ on: "2025-11-02", kind: "initial", quantityDelta: 3, itemId: 3, itemKind: "tool" }),
    ];
    const march = { ...NO_WORKSHOP_HISTORY_FILTER, year: 2026, month: 3 };
    expect(filterWorkshopHistory(entries, march).map((e) => e.on)).toEqual([
      "2026-03-12",
      "2026-03-02",
    ]);
    expect(
      filterWorkshopHistory(entries, {
        ...NO_WORKSHOP_HISTORY_FILTER,
        groups: ["correction", "added"],
      }),
    ).toHaveLength(2);
    expect(
      filterWorkshopHistory(entries, { ...NO_WORKSHOP_HISTORY_FILTER, itemKind: "product" }),
    ).toEqual([entries[2]]);
    expect(
      filterWorkshopHistory(entries, { ...NO_WORKSHOP_HISTORY_FILTER, itemId: 1 }),
    ).toHaveLength(2);
    // The chips count every group within the period, whatever groups are chosen.
    expect(workshopHistoryGroupCounts(entries, { ...march, groups: ["use"] })).toEqual({
      purchase: 1,
      use: 1,
      correction: 0,
      added: 0,
    });
    expect(workshopHistoryPeriods(entries, NO_WORKSHOP_HISTORY_FILTER)).toEqual([
      { year: 2026, months: [3, 2] },
      { year: 2025, months: [11] },
    ]);
  });

  it("groups two or more additions of the same day into one line", () => {
    const entries = [
      entry({ on: "2026-11-03", kind: "purchase", itemId: 4 }),
      entry({ on: "2026-11-02", kind: "initial", itemId: 1 }),
      entry({ on: "2026-11-02", kind: "use", quantityDelta: -1, itemId: 1 }),
      entry({ on: "2026-11-02", kind: "initial", itemId: 2 }),
      entry({ on: "2026-11-02", kind: "initial", itemId: 3 }),
      entry({ on: "2026-10-30", kind: "initial", itemId: 5 }),
    ];
    const rows = workshopHistoryRows(entries);
    expect(rows.map((row) => row.type)).toEqual(["entry", "additions", "entry", "entry"]);
    const additions = rows[1];
    expect(additions.type === "additions" && additions.entries.map((e) => e.itemId)).toEqual([
      1, 2, 3,
    ]);
    // A lone addition stays an entry.
    expect(rows[3]).toMatchObject({ type: "entry", on: "2026-10-30" });
  });

  it("adds up what the purchases cost, those without a price apart", () => {
    expect(
      spendingOf([
        entry({ kind: "purchase", quantityDelta: 2, unitCostCents: 2490 }),
        entry({ kind: "purchase", quantityDelta: 1, unitCostCents: null }),
        entry({ kind: "use", quantityDelta: -1, unitCostCents: 999 }),
      ]),
    ).toEqual({ count: 2, totalCents: 4980, unpriced: 1 });
  });

  it("picks the cheapest priced link, else the first", () => {
    const links = [
      { id: 1, priceCents: null },
      { id: 2, priceCents: 2490 },
      { id: 3, priceCents: 1990 },
    ];
    expect(defaultPurchaseLink(links)?.id).toBe(3);
    expect(defaultPurchaseLink([{ id: 4, priceCents: null }])?.id).toBe(4);
    expect(defaultPurchaseLink([])).toBeNull();
  });
});

describe("a movement in words (D-111)", () => {
  it("says purchases, uses, additions and corrections", () => {
    expect(
      movementSummary(pads, {
        kind: "purchase",
        quantityDelta: 2,
        unitCostCents: 2490,
        source: "Alltricks",
      }),
    ).toBe(fr("Achat · 2~paires à 24,90~€ · Alltricks"));
    expect(movementSummary(wrench, { kind: "purchase", quantityDelta: 1, source: null })).toBe(
      "Achat",
    );
    expect(
      movementSummary(wrench, {
        kind: "purchase",
        quantityDelta: 1,
        unitCostCents: 8900,
        source: "Decathlon",
      }),
    ).toBe(fr("Achat · 89,00~€ · Decathlon"));
    expect(movementSummary(pads, { kind: "use", quantityDelta: -1, source: "Spectral" })).toBe(
      fr("Utilisé · 1~paire · Spectral"),
    );
    expect(movementSummary(pads, { kind: "initial", quantityDelta: 3, source: null })).toBe(
      fr("Ajouté à l'atelier · 3~paires"),
    );
    expect(movementSummary(pads, { kind: "adjustment", quantityDelta: -2, source: null })).toBe(
      fr("Stock corrigé · −2~paires"),
    );
    expect(movementSummary(wrench, { kind: "adjustment", quantityDelta: -1, source: null })).toBe(
      "Plus dans l'atelier",
    );
  });

  it("says a product's level with the one before it", () => {
    expect(
      movementSummary(oil, {
        kind: "use",
        quantityDelta: 0,
        levelBefore: "started",
        levelAfter: "low",
        source: null,
      }),
    ).toBe("Niveau : entamé → presque vide");
    expect(
      movementSummary(oil, {
        kind: "adjustment",
        quantityDelta: 0,
        levelBefore: "low",
        levelAfter: "full",
        source: null,
      }),
    ).toBe("Niveau corrigé : presque vide → plein");
    expect(
      movementSummary(oil, { kind: "use", quantityDelta: -1, levelAfter: "full", source: null }),
    ).toBe(fr("Vide · 1~flacon en moins"));
  });
});
