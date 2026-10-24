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
});
