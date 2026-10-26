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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_DIR: z.string().trim().min(1).default("./data"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  PUBLIC_URL: httpUrl.optional(),
  ALLOW_SIGNUP: booleanString.default(false),
  TZ: z
    .string()
    .trim()
    .refine(isTimeZone, { error: "Expected an IANA time zone, e.g. Europe/Paris" })
    .optional(),
});

export type Env = {
  nodeEnv: "development" | "production" | "test";
  dataDir: string;
  authSecret: string;
  publicUrl: string;
  allowSignup: boolean;
  /** Display time zone (H-02): instants are shown, and "today" is computed, in this zone. */
  timeZone: string;
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
    allowSignup: env.ALLOW_SIGNUP,
    // Without TZ, the zone of the process (UTC in most containers).
    timeZone: env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

let cached: Env | undefined;

/** Reads the configuration lazily, so that `next build` does not need runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
