import "server-only";
import type { PendingReason, RideType } from "@/lib/enums";
import { addDays, daysBetween, type LocalDate } from "@/lib/format";

// Garmin Connect Personal API (phase 2, D-101): what an activity means for Bike-Book, the key's
// expiry, and the import's arithmetic. Pure functions; the HTTP calls live in
// src/server/integrations/garmin, the rows in src/server/db/garmin.ts.

// --- Tokens --------------------------------------------------------------------------------------

/**
 * The expiry of a JWT (its `exp` claim, seconds), as epoch milliseconds, or null when the token
 * is not a JWT with a numeric `exp`. The signature is not checked: the token is Garmin's, used
 * only to know when to ask for a new one.
 */
export function jwtExpiresAt(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const exp = (claims as { exp?: unknown })?.exp;
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when a token expiring at `expiresAt` has less than `marginS` left (or is gone). */
export function tokenNeedsRefresh(expiresAt: number, now: number, marginS: number): boolean {
  return expiresAt - now <= marginS * 1000;
}

// --- Activities ----------------------------------------------------------------------------------

/** The fields of an activity summary the import reads (Garmin's `SummarizedActivityDTO`). */
export type GarminActivitySummary = {
  activityId: number;
  activityName?: string | null;
  startTimeLocal?: string | null;
  startTimeGMT?: string | null;
  activityType?: {
    typeId?: number | null;
    typeKey?: string | null;
    parentTypeId?: number | null;
  } | null;
  distance?: number | null;
  duration?: number | null;
  movingDuration?: number | null;
  elapsedDuration?: number | null;
  elevationGain?: number | null;
  elevationLoss?: number | null;
  averageSpeed?: number | null;
  maxSpeed?: number | null;
  locationName?: string | null;
  calories?: number | null;
  minTemperature?: number | null;
  maxTemperature?: number | null;
  manufacturer?: string | null;
  lapCount?: number | null;
};

/**
 * What is kept of a summary in `external_activities.summary_json`: the ride's figures and a few
 * more for later (bike park laps, temperatures). Never the owner's name, profile or social data,
 * nor the start coordinates.
 */
export const KEPT_SUMMARY_FIELDS = [
  "activityId",
  "activityName",
  "startTimeLocal",
  "startTimeGMT",
  "activityType",
  "distance",
  "duration",
  "movingDuration",
  "elapsedDuration",
  "elevationGain",
  "elevationLoss",
  "averageSpeed",
  "maxSpeed",
  "locationName",
  "calories",
  "minTemperature",
  "maxTemperature",
  "manufacturer",
  "lapCount",
] as const satisfies readonly (keyof GarminActivitySummary)[];

/**
 * An instant written by Garmin as `2026-11-02 16:51:37` (no zone): read as UTC for
 * `startTimeGMT`. Null when it does not have that shape.
 */
export function parseGarminUtc(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value ?? "");
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const instant = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(instant);
  // Rejects 2026-02-30 and the like, which Date.UTC would roll over.
  return check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? instant : null;
}

/** The local start day Garmin gives (`startTimeLocal`'s date), or null. */
export function localStartDay(summary: GarminActivitySummary): LocalDate | null {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(summary.startTimeLocal ?? "")?.[1];
  return day ?? null;
}

/** A positive whole number from Garmin's decimals (`5821.75` → 5822), or null for none or 0. */
function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

/** A whole number ≥ 0, or null. */
function wholeOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function cleanText(value: string | null | undefined, max = 200): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** An activity in the app's units (metres, seconds, UTC epoch ms), as `external_activities` stores it. */
export type ImportedActivity = {
  externalId: string;
  startedAt: number;
  /** Garmin's local start day: compared with the first import's day. */
  localDay: LocalDate | null;
  activityType: string;
  name: string | null;
  location: string | null;
  distanceM: number | null;
  durationS: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  summary: Partial<GarminActivitySummary>;
};

/**
 * An activity summary in the app's units, or null when it cannot become a ride: no id, no UTC
 * start, no type, or no duration at all.
 */
export function toImportedActivity(summary: GarminActivitySummary): ImportedActivity | null {
  if (!Number.isSafeInteger(summary.activityId) || summary.activityId <= 0) return null;
  const startedAt = parseGarminUtc(summary.startTimeGMT);
  const activityType = cleanText(summary.activityType?.typeKey, 80);
  const durationS = positive(summary.duration);
  const movingTimeS = positive(summary.movingDuration);
  if (startedAt == null || !activityType || (durationS == null && movingTimeS == null)) return null;
  const kept: Partial<GarminActivitySummary> = {};
  for (const field of KEPT_SUMMARY_FIELDS) {
    if (summary[field] !== undefined) (kept as Record<string, unknown>)[field] = summary[field];
  }
  return {
    externalId: String(summary.activityId),
    startedAt,
    localDay: localStartDay(summary),
    activityType,
    name: cleanText(summary.activityName),
    location: cleanText(summary.locationName),
    distanceM: wholeOrNull(summary.distance),
    durationS,
    movingTimeS,
    elapsedTimeS: positive(summary.elapsedDuration),
    elevationGainM: wholeOrNull(summary.elevationGain),
    elevationLossM: wholeOrNull(summary.elevationLoss),
    summary: kept,
  };
}

/**
 * True for the stray activities a bike computer records when started by mistake (about a
 * second, a few metres: Verified 2026-11-03 on the owner's account): shorter than `minDurationS`
 * on the timer.
 */
export function isTooShort(
  activity: Pick<ImportedActivity, "durationS" | "movingTimeS">,
  minDurationS: number,
): boolean {
  return (activity.durationS ?? activity.movingTimeS ?? 0) < minDurationS;
}

/**
 * Garmin types whose discipline is known for sure (seen on real activities). Any other type
 * takes the bike's usual ride type: "mountain_biking" can be XC, trail or enduro.
 */
const RIDE_TYPES_BY_GARMIN_TYPE: Record<string, RideType> = {
  gravel_cycling: "gravel",
};

/** The ride type of an imported activity: Garmin's when it is unambiguous, else the bike's usual one. */
export function rideTypeFor(activityType: string, usualRideType: RideType): RideType {
  return RIDE_TYPES_BY_GARMIN_TYPE[activityType] ?? usualRideType;
}

/** The ride an activity becomes on a bike (the ride table's columns, `source` aside). */
export function rideFromActivity(
  activity: Pick<
    ImportedActivity,
    | "startedAt"
    | "name"
    | "location"
    | "distanceM"
    | "durationS"
    | "movingTimeS"
    | "elevationGainM"
    | "elevationLossM"
  >,
  bikeId: number,
  rideType: RideType,
) {
  return {
    bikeId,
    startedAt: activity.startedAt,
    title: activity.name,
    location: activity.location,
    rideType,
    liftAssisted: false,
    distanceM: activity.distanceM,
    descentDistanceM: null,
    // The timer time is what Garmin shows as the ride's time; the moving time drives wear (D-13).
    totalTimeS: activity.durationS ?? activity.movingTimeS,
    movingTimeS: activity.movingTimeS,
    descentTimeS: null,
    runsCount: null,
    elevationGainM: activity.elevationGainM,
    elevationLossM: activity.elevationLossM,
    conditions: null,
    notes: null,
  };
}

export type Assignment =
  | { kind: "ride"; bikeId: number }
  | { kind: "pending"; reason: PendingReason; suggestedBikeId: number | null };

/**
 * Where an activity goes (D-101): a ride of the bike set for its type, unless no bike is set,
 * that bike is no longer ridden, or a ride of that bike typed by hand starts within ±30 minutes
 * (then it waits in "À classer", with that bike offered first).
 */
export function decideAssignment(input: {
  typeBike: { id: number; ridden: boolean } | null;
  nearManualRide: boolean;
}): Assignment {
  const { typeBike, nearManualRide } = input;
  if (!typeBike) return { kind: "pending", reason: "no_bike_for_type", suggestedBikeId: null };
  if (!typeBike.ridden) {
    return { kind: "pending", reason: "bike_not_ridden", suggestedBikeId: typeBike.id };
  }
  if (nearManualRide) {
    return { kind: "pending", reason: "possible_duplicate", suggestedBikeId: typeBike.id };
  }
  return { kind: "ride", bikeId: typeBike.id };
}

// --- Import window -------------------------------------------------------------------------------

/**
 * The first local day an import asks for: the first import's day, or the day of the latest
 * activity already read minus one (a late upload of the same day, a time zone between Garmin's
 * local day and the app's), whichever is later. Duplicates are skipped by their id.
 */
export function importStartDay(importFrom: LocalDate, latestLocalDay: LocalDate | null): LocalDate {
  if (!latestLocalDay) return importFrom;
  const resume = addDays(latestLocalDay, -1);
  return resume > importFrom ? resume : importFrom;
}

// --- Key expiry ----------------------------------------------------------------------------------

export type KeyState =
  /** More than the first warning threshold left. */
  | { state: "ok"; daysLeft: number }
  /** Within a warning threshold (30 then 7 days by default): `threshold` is the one reached. */
  | { state: "expires_soon"; daysLeft: number; threshold: number }
  /** Its expiry day has passed: imports stop. */
  | { state: "expired"; daysLeft: number }
  /** Garmin refused it (401 twice): imports stop until a new key is saved. */
  | { state: "rejected" };

/**
 * The key's state on `today`. The key works through its expiry day (**Assumption**: Garmin's
 * exact cut-off time is not documented); from the next day on it is expired. A refusal by
 * Garmin wins over the dates.
 */
export function keyState(input: {
  expiresOn: LocalDate;
  rejected: boolean;
  today: LocalDate;
  warnDays: readonly number[];
}): KeyState {
  if (input.rejected) return { state: "rejected" };
  const daysLeft = daysBetween(input.today, input.expiresOn);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  const reached = [...input.warnDays].sort((a, b) => a - b).find((days) => daysLeft <= days);
  return reached == null
    ? { state: "ok", daysLeft }
    : { state: "expires_soon", daysLeft, threshold: reached };
}

/** True when imports may run with this key. */
export function keyUsable(state: KeyState): boolean {
  return state.state === "ok" || state.state === "expires_soon";
}

// --- Retries -------------------------------------------------------------------------------------

/**
 * How long to wait before retry `attempt` (1, 2, 3…) after a 429, a 5xx or a network error:
 * the server's `Retry-After` (seconds or an HTTP date) when it gives one, else an exponential
 * delay from `baseMs` with up to 50 % jitter; never more than `maxMs`. Garmin publishes no rate
 * limit for the Personal API and sends no rate-limit header (Verified 2026-11-03).
 */
export function retryDelayMs(input: {
  attempt: number;
  retryAfter: string | null;
  now: number;
  baseMs: number;
  maxMs: number;
  random: number;
}): number {
  const { attempt, retryAfter, now, baseMs, maxMs, random } = input;
  if (retryAfter) {
    const seconds = Number(retryAfter.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxMs);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - now), maxMs);
  }
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(Math.round(exponential * (1 + 0.5 * random)), maxMs);
}
