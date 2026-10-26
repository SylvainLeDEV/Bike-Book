import "server-only";
import { localDateOf, type LocalDate } from "@/lib/format";
import { getEnv } from "@/server/env";

/** Today's calendar date in the display time zone (TZ). */
export function today(now: number = Date.now()): LocalDate {
  return localDateOf(now, getEnv().timeZone);
}
