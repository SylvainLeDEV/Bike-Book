import "server-only";
import type { LocalDate } from "@/lib/format";

/** A maintenance event as the total cost sees it (D-44). */
export type CostEvent = {
  id: number;
  on: LocalDate;
  title: string;
  /** null: done at home. */
  shopName: string | null;
  /** Missing prices count as zero. */
  costCents: number | null;
};

export type TotalCost = {
  purchaseCents: number;
  shopCents: number;
  shopVisits: number;
  homeCents: number;
  homeEvents: number;
  saleCents: number | null;
  upkeepCents: number;
  totalCents: number;
  riddenDistanceM: number;
  rideCount: number;
  /** null until the bike has ridden some distance. */
  per100KmCents: number | null;
  per100KmUpkeepCents: number | null;
  /** The events added up, oldest first: "Voir le calcul". */
  events: (CostEvent & { costCents: number })[];
};

const METRES_PER_100_KM = 100_000;

/**
 * Total cost of a bike (D-44, docs/03): purchase + maintenance events − sale price if sold, and
 * per 100 km with and without the purchase, over the distance of the rides only (without the
 * distance before tracking started). Parts count through their maintenance events only.
 */
export function computeTotalCost(input: {
  purchasePriceCents: number | null;
  /** Only for a sold bike. */
  salePriceCents: number | null;
  events: CostEvent[];
  riddenDistanceM: number;
  rideCount: number;
}): TotalCost {
  const events = input.events
    .map((event) => ({ ...event, costCents: event.costCents ?? 0 }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.id - b.id));
  const atShop = events.filter((event) => event.shopName != null);
  const atHome = events.filter((event) => event.shopName == null);
  const sum = (list: { costCents: number }[]) => list.reduce((n, e) => n + e.costCents, 0);

  const purchaseCents = input.purchasePriceCents ?? 0;
  const shopCents = sum(atShop);
  const homeCents = sum(atHome);
  const upkeepCents = shopCents + homeCents;
  const totalCents = purchaseCents + upkeepCents - (input.salePriceCents ?? 0);
  const per100 = (cents: number) =>
    input.riddenDistanceM > 0
      ? Math.round((cents * METRES_PER_100_KM) / input.riddenDistanceM)
      : null;

  return {
    purchaseCents,
    shopCents,
    shopVisits: atShop.length,
    homeCents,
    homeEvents: atHome.length,
    saleCents: input.salePriceCents,
    upkeepCents,
    totalCents,
    riddenDistanceM: input.riddenDistanceM,
    rideCount: input.rideCount,
    per100KmCents: per100(totalCents),
    per100KmUpkeepCents: per100(upkeepCents),
    events,
  };
}
