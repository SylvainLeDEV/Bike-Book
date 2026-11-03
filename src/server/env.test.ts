import { describe, expect, it } from "vitest";
import { EXAMPLE_AUTH_SECRET, parseEnv } from "./env";

const SECRET = "x".repeat(32);

describe("parseEnv", () => {
  it("uses local defaults in development", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.dataDir).toBe("./data");
    expect(env.publicUrl).toBe("http://localhost:3000");
    expect(env.allowSignup).toBe(false);
    expect(env.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("requires AUTH_SECRET and PUBLIC_URL in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/AUTH_SECRET is required/);
    expect(() => parseEnv({ NODE_ENV: "production", AUTH_SECRET: SECRET })).toThrow(
      /PUBLIC_URL is required/,
    );
  });

  it("rejects the example secret in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        AUTH_SECRET: EXAMPLE_AUTH_SECRET,
        PUBLIC_URL: "http://bikes.lan",
      }),
    ).toThrow(/example value/);
  });

  it("rejects a short secret", () => {
    expect(() => parseEnv({ AUTH_SECRET: "too-short" })).toThrow(/at least 32 characters/);
  });

  it("normalises PUBLIC_URL to an origin and rejects other protocols", () => {
    expect(parseEnv({ PUBLIC_URL: "http://bikes.lan:8080/some/path" }).publicUrl).toBe(
      "http://bikes.lan:8080",
    );
    expect(() => parseEnv({ PUBLIC_URL: "ftp://bikes.lan" })).toThrow(/http\(s\) URL/);
  });

  it("parses ALLOW_SIGNUP and treats empty values as unset", () => {
    expect(parseEnv({ ALLOW_SIGNUP: "true" }).allowSignup).toBe(true);
    expect(parseEnv({ ALLOW_SIGNUP: "1" }).allowSignup).toBe(true);
    expect(parseEnv({ ALLOW_SIGNUP: "false" }).allowSignup).toBe(false);
    expect(parseEnv({ ALLOW_SIGNUP: "" }).allowSignup).toBe(false);
    expect(() => parseEnv({ ALLOW_SIGNUP: "yes" })).toThrow(/true or false/);
  });

  it("reads the display time zone and rejects unknown ones", () => {
    expect(parseEnv({ TZ: "Europe/Paris" }).timeZone).toBe("Europe/Paris");
    expect(parseEnv({}).timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(() => parseEnv({ TZ: "Europe/Nowhere" })).toThrow(/IANA time zone/);
  });
});

describe("Garmin configuration (D-101)", () => {
  it("has defaults for everything", () => {
    expect(parseEnv({}).garmin).toEqual({
      apiBaseUrl: "https://personal.connectapi.garmin.com",
      syncIntervalH: 6,
      minDurationS: 60,
      tokenRefreshMarginS: 3600,
      keyWarnDays: [30, 7],
      downloadFit: false,
    });
  });

  it("reads the variables and refuses bad values", () => {
    const garmin = parseEnv({
      GARMIN_SYNC_INTERVAL_H: "0",
      GARMIN_MIN_DURATION_S: "120",
      GARMIN_TOKEN_REFRESH_MARGIN_S: "1800",
      GARMIN_KEY_WARN_DAYS: "60, 14,3",
      GARMIN_DOWNLOAD_FIT: "true",
      GARMIN_API_BASE_URL: "https://personal.connectapi.garmin.cn/",
    }).garmin;
    expect(garmin).toEqual({
      apiBaseUrl: "https://personal.connectapi.garmin.cn",
      syncIntervalH: 0,
      minDurationS: 120,
      tokenRefreshMarginS: 1800,
      keyWarnDays: [60, 14, 3],
      downloadFit: true,
    });
    expect(() => parseEnv({ GARMIN_KEY_WARN_DAYS: "trente" })).toThrow(/separated by commas/);
    expect(() => parseEnv({ GARMIN_SYNC_INTERVAL_H: "-1" })).toThrow(/At least 0/);
    expect(() => parseEnv({ GARMIN_API_BASE_URL: "http://garmin.test" })).toThrow();
  });
});
