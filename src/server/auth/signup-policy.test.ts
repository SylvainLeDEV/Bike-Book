import { describe, expect, it } from "vitest";
import { canCreateAccount } from "./signup-policy";

describe("canCreateAccount", () => {
  it("allows the first account even when sign-up is off", () => {
    expect(canCreateAccount({ existingUsers: 0, allowSignup: false })).toBe(true);
  });

  it("refuses further accounts when sign-up is off", () => {
    expect(canCreateAccount({ existingUsers: 1, allowSignup: false })).toBe(false);
  });

  it("allows further accounts when sign-up is on", () => {
    expect(canCreateAccount({ existingUsers: 3, allowSignup: true })).toBe(true);
  });
});
