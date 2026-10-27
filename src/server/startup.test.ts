import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "./startup";

/** A server environment with neither AUTH_SECRET nor PUBLIC_URL set. */
function stubEnv(nodeEnv: "development" | "production") {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("AUTH_SECRET", undefined);
  vi.stubEnv("PUBLIC_URL", undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startServer", () => {
  it("exits with an error in production when the configuration is invalid (D-28)", () => {
    stubEnv("production");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    startServer();

    expect(exit).toHaveBeenCalledWith(1);
    expect(String(log.mock.calls[0]?.[1])).toMatch(/AUTH_SECRET is required/);
  });

  it("throws in development instead of exiting", () => {
    stubEnv("development");
    vi.stubEnv("AUTH_SECRET", "too-short");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    expect(() => startServer()).toThrow(/at least 32 characters/);
    expect(exit).not.toHaveBeenCalled();
  });
});
