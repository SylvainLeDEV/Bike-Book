import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatCount,
  formatDate,
  formatDayLabel,
  formatDecimal,
  formatDistance,
  formatDuration,
  formatEta,
  formatFileSize,
  formatHours,
  formatInteger,
  formatMoney,
  formatMonthYear,
  formatPercent,
  formatSignedInteger,
  endOfLocalDay,
  isLocalDate,
  localDateOf,
  localInstant,
  startOfLocalDay,
  MINUS,
  NBSP,
  NNBSP,
  plural,
  weekdayOf,
} from "./format";

// Readable expectations: "_" stands for the narrow no-break space, "~" for the no-break space.
const fr = (text: string) => text.replaceAll("_", NNBSP).replaceAll("~", NBSP);

describe("numbers", () => {
  it("groups thousands with a narrow no-break space", () => {
    expect(formatInteger(2846)).toBe(fr("2_846"));
    expect(formatInteger(1_234_567)).toBe(fr("1_234_567"));
    expect(formatInteger(999)).toBe("999");
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(-1620)).toBe(`${MINUS}${fr("1_620")}`);
  });

  it("uses a decimal comma", () => {
    expect(formatDecimal(15.2, 1)).toBe("15,2");
    expect(formatDecimal(1284, 2)).toBe(fr("1_284,00"));
    expect(formatDecimal(0.05, 1)).toBe("0,1");
    expect(formatDecimal(-0.01, 1)).toBe("0,0");
  });

  it("signs movements with a real minus", () => {
    expect(formatSignedInteger(2)).toBe("+2");
    expect(formatSignedInteger(-1)).toBe(`${MINUS}1`);
    expect(formatSignedInteger(0)).toBe("0");
  });

  it("formats money in euros, the sign after the amount", () => {
    expect(formatMoney(128_400)).toBe(fr("1_284,00~€"));
    expect(formatMoney(2200)).toBe(fr("22,00~€"));
    expect(formatMoney(0)).toBe(fr("0,00~€"));
    expect(formatMoney(558_300)).toBe(fr("5_583,00~€"));
  });

  it("formats distances from metres", () => {
    expect(formatDistance(2_846_000)).toBe(fr("2_846~km"));
    expect(formatDistance(38_400)).toBe(fr("38~km"));
    expect(formatDistance(42_500, 1)).toBe(fr("42,5~km"));
  });

  it("formats percentages, sizes and counts", () => {
    expect(formatPercent(1.13)).toBe(fr("113~%"));
    expect(formatFileSize(412_000)).toBe(fr("412~Ko"));
    expect(formatFileSize(1_100_000)).toBe(fr("1,1~Mo"));
    expect(formatFileSize(25_000_000)).toBe(fr("25~Mo"));
    expect(formatCount(1, "paire", "paires")).toBe(fr("1~paire"));
    expect(formatCount(0, "pièce", "pièces")).toBe(fr("0~pièce"));
    expect(formatCount(3, "pièce", "pièces")).toBe(fr("3~pièces"));
    expect(plural(2, "a", "b")).toBe("b");
  });
});

describe("durations", () => {
  it("writes hours and minutes the French way", () => {
    expect(formatDuration(56 * 3600 + 20 * 60)).toBe(fr("56_h_20"));
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe(fr("3_h_05"));
    expect(formatDuration(6 * 3600)).toBe(fr("6~h"));
    expect(formatDuration(45 * 60)).toBe(fr("45~min"));
  });

  it("rounds to the nearest minute", () => {
    expect(formatDuration(3599)).toBe(fr("1~h"));
    expect(formatDuration(29)).toBe(fr("0~min"));
  });

  it("rounds counters to whole hours", () => {
    expect(formatHours(198 * 3600 + 1200)).toBe(fr("198~h"));
  });
});

describe("calendar dates", () => {
  it("writes long and short dates", () => {
    expect(formatDate("2024-03-14")).toBe(fr("14~mars~2024"));
    expect(formatDate("2026-11-01", { year: "never" })).toBe(fr("1er~novembre"));
    expect(formatDate("2026-10-12", { month: "short", year: "auto", today: "2026-10-25" })).toBe(
      fr("12~oct."),
    );
    expect(formatDate("2025-06-06", { month: "short", year: "auto", today: "2026-10-25" })).toBe(
      fr("6~juin~2025"),
    );
  });

  it("names the weekday", () => {
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(formatDate("2026-10-25", { weekday: "long", year: "never", capitalized: true })).toBe(
      fr("Dimanche~25~octobre"),
    );
    expect(formatDayLabel("2026-10-22", "2026-10-25")).toBe(fr("Jeu.~22~oct."));
    expect(formatDayLabel("2026-10-24", "2026-10-25")).toBe("Hier");
    expect(formatDayLabel("2026-10-25", "2026-10-25")).toBe("Aujourd'hui");
    expect(formatMonthYear("2026-09-12")).toBe(fr("Septembre~2026"));
  });

  it("counts days without being fooled by clock changes", () => {
    // Europe: summer time ends on 25 October 2026 and starts on 29 March 2026.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-25", "2026-10-12")).toBe(-13);
    expect(daysBetween("2024-03-14", "2026-10-25")).toBe(955);
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("projects in approximate words", () => {
    expect(formatEta(5)).toBe(fr("≈~dans 5~jours"));
    expect(formatEta(1)).toBe(fr("≈~demain"));
    expect(formatEta(15)).toBe(fr("≈~dans 2~semaines"));
    expect(formatEta(61)).toBe(fr("≈~dans 2~mois"));
    expect(formatEta(400)).toBe(fr("≈~dans 1~an"));
  });
});

describe("localDateOf", () => {
  const paris = "Europe/Paris";

  it("takes the calendar date in the configured time zone, not in UTC", () => {
    // 23:30 UTC on 30 June is already 1 July in Paris (UTC+2 in summer).
    expect(localDateOf(Date.UTC(2026, 5, 30, 23, 30), paris)).toBe("2026-07-01");
    expect(localDateOf(Date.UTC(2026, 5, 30, 21, 30), paris)).toBe("2026-06-30");
  });

  it("handles the night summer time starts (29 March 2026)", () => {
    // 00:30 in Paris (UTC+1) on 29 March, then 03:30 (UTC+2) after the clocks jump.
    expect(localDateOf(Date.UTC(2026, 2, 28, 23, 30), paris)).toBe("2026-03-29");
    expect(localDateOf(Date.UTC(2026, 2, 29, 1, 30), paris)).toBe("2026-03-29");
    expect(localDateOf(Date.UTC(2026, 2, 29, 22, 30), paris)).toBe("2026-03-30");
  });

  it("handles the night summer time ends (25 October 2026)", () => {
    // 00:30 CEST on 25 October, then 23:30 CET the same day, then 00:30 CET on the 26th.
    expect(localDateOf(Date.UTC(2026, 9, 24, 22, 30), paris)).toBe("2026-10-25");
    expect(localDateOf(Date.UTC(2026, 9, 25, 22, 30), paris)).toBe("2026-10-25");
    expect(localDateOf(Date.UTC(2026, 9, 25, 23, 30), paris)).toBe("2026-10-26");
  });
});

describe("isLocalDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isLocalDate("2026-10-25")).toBe(true);
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-10-5")).toBe(false);
    expect(isLocalDate("25/10/2026")).toBe(false);
  });
});

describe("local instants and clock changes (Europe/Paris)", () => {
  const PARIS = "Europe/Paris";
  const iso = (ms: number) => new Date(ms).toISOString();

  it("places noon in summer and winter time", () => {
    expect(iso(localInstant("2026-07-14", { hour: 12 }, PARIS))).toBe("2026-07-14T10:00:00.000Z");
    expect(iso(localInstant("2026-12-24", { hour: 12 }, PARIS))).toBe("2026-12-24T11:00:00.000Z");
  });

  it("handles the day the clocks go back (25 October 2026, a 25-hour day)", () => {
    expect(iso(startOfLocalDay("2026-10-25", PARIS))).toBe("2026-10-24T22:00:00.000Z");
    expect(iso(localInstant("2026-10-25", { hour: 12 }, PARIS))).toBe("2026-10-25T11:00:00.000Z");
    expect(iso(endOfLocalDay("2026-10-25", PARIS))).toBe("2026-10-25T22:59:59.999Z");
    expect(localDateOf(endOfLocalDay("2026-10-25", PARIS), PARIS)).toBe("2026-10-25");
  });

  it("handles the day the clocks go forward (29 March 2026, a 23-hour day)", () => {
    expect(iso(startOfLocalDay("2026-03-29", PARIS))).toBe("2026-03-28T23:00:00.000Z");
    expect(iso(localInstant("2026-03-29", { hour: 12 }, PARIS))).toBe("2026-03-29T10:00:00.000Z");
    expect(iso(endOfLocalDay("2026-03-29", PARIS))).toBe("2026-03-29T21:59:59.999Z");
    // 02:30 does not exist that night: it falls after the gap.
    expect(iso(localInstant("2026-03-29", { hour: 2, minute: 30 }, PARIS))).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("works in UTC and far from it", () => {
    expect(iso(localInstant("2026-10-25", { hour: 12 }, "UTC"))).toBe("2026-10-25T12:00:00.000Z");
    expect(iso(startOfLocalDay("2026-10-25", "Pacific/Auckland"))).toBe("2026-10-24T11:00:00.000Z");
  });
});
