import "server-only";
import { z } from "zod";

/** Placeholder shipped in .env.example: rejected in production so it is never used for real. */
export const EXAMPLE_AUTH_SECRET = "replace-me-with-the-output-of-openssl-rand-base64-32";

const DEV_AUTH_SECRET = "dev-only-insecure-secret-do-not-use-in-production";
const DEV_PUBLIC_URL = "http://localhost:3000";

const booleanString = z
  .enum(["true", "false", "1", "0"], { error: "Expected true or false" })
  .transform((value) => value === "true" || value === "1");

const httpUrl = z
  .url({ protocol: /^https?$/, error: "Expected an http(s) URL, e.g. http://bikes.lan" })
  .transform((value) => new URL(value).origin);

/** True when the runtime knows this IANA time zone ("Europe/Paris"). */
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const wholeNumber = (min: number, max: number) =>
  z.coerce
    .number({ error: "Expected a whole number" })
    .int("Expected a whole number")
    .min(min, `At least ${min}`)
    .max(max, `At most ${max}`);

/** "30,7": days before the key's expiry when the app warns (D-101). */
const dayList = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\s*,\s*\d{1,3})*$/, "Expected days separated by commas, e.g. 30,7")
  .transform((value) => [...new Set(value.split(",").map((day) => Number(day.trim())))]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_DIR: z.string().trim().min(1).default("./data"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  PUBLIC_URL: httpUrl.optional(),
  TRUSTED_ORIGINS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(httpUrl))
    .optional(),
  ALLOW_SIGNUP: booleanString.default(false),
  TZ: z
    .string()
    .trim()
    .refine(isTimeZone, { error: "Expected an IANA time zone, e.g. Europe/Paris" })
    .optional(),
  // Garmin Connect imports (phase 2, D-101). The key itself is typed in Paramètres, not here.
  GARMIN_API_BASE_URL: z
    .url({ protocol: /^https$/ })
    .default("https://personal.connectapi.garmin.com"),
  GARMIN_SYNC_INTERVAL_H: wholeNumber(0, 168).default(6),
  GARMIN_MIN_DURATION_S: wholeNumber(0, 3600).default(60),
  GARMIN_TOKEN_REFRESH_MARGIN_S: wholeNumber(0, 43_200).default(3600),
  GARMIN_KEY_WARN_DAYS: dayList.default([30, 7]),
  GARMIN_DOWNLOAD_FIT: booleanString.default(false),
});

/** How the Garmin import runs (D-101); every value has a default. */
export type GarminConfig = {
  /** https://personal.connectapi.garmin.com (or Garmin's China server). */
  apiBaseUrl: string;
  /** Hours between two automatic imports; 0 turns them off (the "Synchroniser" button stays). */
  syncIntervalH: number;
  /** Activities shorter than this on the timer are left out (stray seconds-long recordings). */
  minDurationS: number;
  /** A new token is asked for when the current one has less than this left. */
  tokenRefreshMarginS: number;
  /** Days before the key's expiry when the app warns, e.g. [30, 7]. */
  keyWarnDays: number[];
  /** Keep each imported ride's FIT file as an attachment (off by default). */
  downloadFit: boolean;
};

export type Env = {
  nodeEnv: "development" | "production" | "test";
  dataDir: string;
  authSecret: string;
  publicUrl: string;
  /** Other origins accepted at sign-in besides `publicUrl` (e.g. the server's IP and port). */
  trustedOrigins: string[];
  allowSignup: boolean;
  /** Display time zone (H-02): instants are shown, and "today" is computed, in this zone. */
  timeZone: string;
  garmin: GarminConfig;
};

/**
 * Parses and checks the configuration. Development and tests get safe local defaults;
 * production must set AUTH_SECRET and PUBLIC_URL explicitly.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Empty strings (e.g. `ALLOW_SIGNUP=` in a .env file) mean "not set".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;
  const isProduction = env.NODE_ENV === "production";

  const problems: string[] = [];
  if (isProduction && !env.AUTH_SECRET) {
    problems.push("AUTH_SECRET is required (generate one with: openssl rand -base64 32)");
  }
  if (isProduction && env.AUTH_SECRET === EXAMPLE_AUTH_SECRET) {
    problems.push("AUTH_SECRET still has the example value: generate a real secret");
  }
  if (isProduction && !env.PUBLIC_URL) {
    // Without it, session cookies are marked Secure and login silently fails over plain HTTP.
    problems.push("PUBLIC_URL is required: the origin users type, e.g. http://bikes.lan");
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n${problems.map((p) => `  ✖ ${p}`).join("\n")}`);
  }

  return {
    nodeEnv: env.NODE_ENV,
    dataDir: env.DATA_DIR,
    authSecret: env.AUTH_SECRET ?? DEV_AUTH_SECRET,
    publicUrl: env.PUBLIC_URL ?? DEV_PUBLIC_URL,
    trustedOrigins: [...new Set(env.TRUSTED_ORIGINS ?? [])],
    allowSignup: env.ALLOW_SIGNUP,
    // Without TZ, the zone of the process (UTC in most containers).
    timeZone: env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    garmin: {
      apiBaseUrl: env.GARMIN_API_BASE_URL.replace(/\/+$/, ""),
      syncIntervalH: env.GARMIN_SYNC_INTERVAL_H,
      minDurationS: env.GARMIN_MIN_DURATION_S,
      tokenRefreshMarginS: env.GARMIN_TOKEN_REFRESH_MARGIN_S,
      keyWarnDays: env.GARMIN_KEY_WARN_DAYS,
      downloadFit: env.GARMIN_DOWNLOAD_FIT,
    },
  };
}

let cached: Env | undefined;

/** Reads the configuration lazily, so that `next build` does not need runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
