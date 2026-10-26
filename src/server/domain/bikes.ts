import "server-only";
import type { BikeStatus, Discipline, RideType } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";

export type BikeStatusFields = {
  status: BikeStatus;
  statusChangedOn: LocalDate | null;
  salePriceCents: number | null;
};

/**
 * The status columns to write when a bike is saved (D-43):
 * - sold: the sale date (today if not given) and the sale price;
 * - status unchanged: its start date is kept;
 * - a new active bike: active since its purchase (else since today);
 * - any other change: since today.
 * A sale price only exists on a sold bike.
 */
export function resolveBikeStatus(
  previous: Pick<BikeStatusFields, "status" | "statusChangedOn"> | null,
  input: {
    status: BikeStatus;
    soldOn: LocalDate | null;
    salePriceCents: number | null;
    purchasedOn: LocalDate | null;
  },
  today: LocalDate,
): BikeStatusFields {
  const { status } = input;
  if (status === "sold") {
    return { status, statusChangedOn: input.soldOn ?? today, salePriceCents: input.salePriceCents };
  }
  if (previous?.status === status) {
    return { status, statusChangedOn: previous.statusChangedOn, salePriceCents: null };
  }
  if (!previous && status === "active") {
    return { status, statusChangedOn: input.purchasedOn ?? today, salePriceCents: null };
  }
  return { status, statusChangedOn: today, salePriceCents: null };
}

/** Active bikes are listed first; the others are folded away (docs/04, /bikes). */
export function isListedFirst(status: BikeStatus): boolean {
  return status === "active";
}

/** Bikes offered in the quick ride entry: the ones that can still be ridden. */
export function canBeRidden(status: BikeStatus): boolean {
  return status === "active" || status === "stored";
}

const RIDE_TYPE_BY_DISCIPLINE: Record<Discipline, RideType> = {
  road: "road",
  gravel: "gravel",
  xc: "xc",
  trail: "trail",
  enduro: "enduro",
  dh: "dh",
  dirt: "other",
  city: "commute",
  other: "other",
};

/** The ride type offered for a bike that has no ride yet. */
export function defaultRideType(discipline: Discipline): RideType {
  return RIDE_TYPE_BY_DISCIPLINE[discipline];
}
