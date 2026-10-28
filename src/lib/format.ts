/**
 * French formatting for the UI (H-01): narrow no-break space between thousands, decimal comma,
 * no-break space before units, "€" after the amount.
 *
 * Written by hand rather than with Intl.NumberFormat so the server and every browser produce
 * the same characters (ICU versions differ), which keeps hydration stable. Calendar dates are
 * `YYYY-MM-DD` strings (`LocalDate`): instants are turned into local dates on the server with
 * `localDateOf`, in the configured time zone, before they reach a component.
 */

/** Narrow no-break space (U+202F): thousands separator, and inside "56 h 20". */
export const NNBSP = " ";
/** No-break space (U+00A0): before a unit or the euro sign. */
export const NBSP = " ";
/** Minus sign (U+2212), for signed quantities such as stock movements. */
export const MINUS = "−";

/** A calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/** 2846 → "2 846". Rounds to the nearest integer. */
export function formatInteger(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? MINUS : "";
  return sign + groupThousands(String(Math.abs(rounded)));
}

/** 15.2 → "15,2"; 1284 with 2 digits → "1 284,00". */
export function formatDecimal(value: number, fractionDigits: number): string {
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [whole, fraction] = fixed.split(".");
  const negative = value < 0 && Number(fixed) !== 0;
  return (negative ? MINUS : "") + groupThousands(whole) + (fraction ? `,${fraction}` : "");
}

/** "+2" or "−1". */
export function formatSignedInteger(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${formatInteger(rounded)}` : formatInteger(rounded);
}

/** Joins a figure and its unit with a no-break space: "2 846 km". */
export function withUnit(figure: string, unit: string): string {
  return `${figure}${NBSP}${unit}`;
}

/** Metres to kilometres: 2846000 → "2 846 km". */
export function formatDistance(meters: number, fractionDigits = 0): string {
  const km = meters / 1000;
  return withUnit(fractionDigits ? formatDecimal(km, fractionDigits) : formatInteger(km), "km");
}

/** Kilometres without the unit, for figures shown with a separate unit label. */
export function formatKilometres(meters: number): string {
  return formatInteger(meters / 1000);
}

/** Elevation in metres: "1 620 m". */
export function formatElevation(meters: number): string {
  return withUnit(formatInteger(meters), "m");
}

/** Seconds to "56 h 20", "6 h" or "45 min" (rounded to the minute). */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return withUnit(String(minutes), "min");
  if (minutes === 0) return withUnit(formatInteger(hours), "h");
  return `${formatInteger(hours)}${NNBSP}h${NNBSP}${String(minutes).padStart(2, "0")}`;
}

/** Whole hours, for counters: 712800 s → "198 h". */
export function formatHours(seconds: number): string {
  return withUnit(formatInteger(seconds / 3600), "h");
}

/** Days with the short unit: "83 j". */
export function formatDays(days: number): string {
  return withUnit(formatInteger(days), "j");
}

/** Euro cents to "1 284,00 €". */
export function formatMoney(cents: number): string {
  return withUnit(formatDecimal(cents / 100, 2), "€");
}

/** Ratio to "113 %". */
export function formatPercent(ratio: number): string {
  return withUnit(formatInteger(ratio * 100), "%");
}

/** File sizes the French way: "412 Ko", "1,1 Mo". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return withUnit(formatInteger(bytes), "o");
  if (bytes < 1_000_000) return withUnit(formatInteger(bytes / 1000), "Ko");
  const mb = bytes / 1_000_000;
  return withUnit(mb < 10 ? formatDecimal(mb, 1) : formatInteger(mb), "Mo");
}

/** French plural: 0 and 1 take the singular. */
export function plural(count: number, one: string, many: string): string {
  return Math.abs(count) >= 2 ? many : one;
}

/** "3 pièces", "1 paire", "0 pièce". */
export function formatCount(count: number, one: string, many: string): string {
  return `${formatInteger(count)}${NBSP}${plural(count, one, many)}`;
}

// --- Calendar dates ----------------------------------------------------------------------------

const MONTHS_LONG = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const WEEKDAYS_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEKDAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** True for a real calendar date written `YYYY-MM-DD` ("2026-02-30" is not one). */
export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toUtcDays(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function fromUtcDays(days: number): LocalDate {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). Immune to clock changes. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round(toUtcDays(to) - toUtcDays(from));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcDays(toUtcDays(date) + days);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(toUtcDays(date) * 86_400_000).getUTCDay();
}

/** The calendar date of an instant (epoch milliseconds) in a time zone, e.g. "Europe/Paris". */
export function localDateOf(epochMs: number, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The wall-clock time of an instant in a time zone, "HH:MM" (24 h). */
export function localTimeOf(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

/** Milliseconds to add to UTC to get the wall-clock time of `timeZone` at that instant. */
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  let format = zoneFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wall - (epochMs - (((epochMs % 1000) + 1000) % 1000));
}

/**
 * The instant of a wall-clock time on a calendar date in a time zone: noon on 25 October 2026 in
 * Europe/Paris is 11:00 UTC (winter time from 03:00 that day). For a time skipped by a clock
 * change, the result falls just after the gap.
 */
export function localInstant(
  date: LocalDate,
  time: { hour: number; minute?: number; second?: number; millisecond?: number },
  timeZone: string,
): number {
  const { year, month, day } = parseLocalDate(date);
  const wall = Date.UTC(
    year,
    month - 1,
    day,
    time.hour,
    time.minute ?? 0,
    time.second ?? 0,
    time.millisecond ?? 0,
  );
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(first, timeZone);
  return second;
}

/** The first millisecond of a calendar date in a time zone. */
export function startOfLocalDay(date: LocalDate, timeZone: string): number {
  return localInstant(date, { hour: 0 }, timeZone);
}

/** The last millisecond of a calendar date in a time zone (23:59:59.999, whatever its length). */
export function endOfLocalDay(date: LocalDate, timeZone: string): number {
  return startOfLocalDay(addDays(date, 1), timeZone) - 1;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type DateOptions = {
  /** "long": "14 mars 2024"; "short": "12 oct." */
  month?: "long" | "short";
  /** "auto" leaves the year out when it is the year of `today`. */
  year?: "always" | "auto" | "never";
  weekday?: "long" | "short";
  today?: LocalDate;
  /** Capital first letter, for dates that start a line ("Sam. 24 oct."). */
  capitalized?: boolean;
};

/** "14 mars 2024", "1er novembre", "Sam. 24 oct.", "Dimanche 25 octobre"… */
export function formatDate(date: LocalDate, options: DateOptions = {}): string {
  const { month = "long", year = "always", weekday, today, capitalized = false } = options;
  const parts = parseLocalDate(date);
  const words: string[] = [];
  if (weekday) {
    const names = weekday === "long" ? WEEKDAYS_LONG : WEEKDAYS_SHORT;
    words.push(names[weekdayOf(date)]);
  }
  words.push(parts.day === 1 ? "1er" : String(parts.day));
  words.push((month === "long" ? MONTHS_LONG : MONTHS_SHORT)[parts.month - 1]);
  const sameYear = today ? parseLocalDate(today).year === parts.year : false;
  if (year === "always" || (year === "auto" && !sameYear)) words.push(String(parts.year));
  const text = words.join(NBSP);
  return capitalized ? capitalize(text) : text;
}

/** "Octobre 2026", for month headings. */
export function formatMonthYear(date: LocalDate): string {
  const { year, month } = parseLocalDate(date);
  return `${capitalize(MONTHS_LONG[month - 1])}${NBSP}${year}`;
}

/** "Octobre", for a list of months (1 = janvier). */
export function formatMonthName(month: number): string {
  return capitalize(MONTHS_LONG[month - 1]);
}

/** "Aujourd'hui" or "Hier", else the short date with its weekday: "Jeu. 22 oct.". */
export function formatDayLabel(date: LocalDate, today: LocalDate): string {
  const days = daysBetween(date, today);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return formatDate(date, {
    month: "short",
    year: "auto",
    weekday: "short",
    today,
    capitalized: true,
  });
}

/** Projection in words, always approximate: "≈ dans 5 jours", "≈ dans 2 semaines". */
export function formatEta(days: number): string {
  const prefix = `≈${NBSP}`;
  if (days <= 0) return `${prefix}maintenant`;
  if (days === 1) return `${prefix}demain`;
  if (days < 14) return `${prefix}dans ${days}${NBSP}jours`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${prefix}dans ${weeks}${NBSP}semaines`;
  }
  if (days < 365) {
    const months = Math.round(days / 30.4);
    return `${prefix}dans ${months}${NBSP}mois`;
  }
  const years = Math.round(days / 365);
  return `${prefix}dans ${years}${NBSP}${plural(years, "an", "ans")}`;
}
