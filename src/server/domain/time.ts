import "server-only";
import { endOfLocalDay, localDateOf, localInstant, type LocalDate } from "@/lib/format";

// Turning the dates people type into the instants counters compare (D-61).

/**
 * The instant of a dated event (replacement, maintenance, added part) recorded at `recordedAt`:
 * the moment it was recorded when dated that same day, else the last millisecond of its day, so
 * the rides of a past day count before it (a morning ride stays on the old part).
 */
export function eventInstant(on: LocalDate, recordedAt: number, timeZone: string): number {
  return localDateOf(recordedAt, timeZone) === on ? recordedAt : endOfLocalDay(on, timeZone);
}

/** A ride without a start time starts at noon, local time: an hour that exists every day. */
export function rideStartInstant(
  on: LocalDate,
  time: { hour: number; minute: number } | null,
  timeZone: string,
): number {
  return localInstant(on, time ?? { hour: 12, minute: 0 }, timeZone);
}
