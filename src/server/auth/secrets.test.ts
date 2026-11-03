import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

const SECRET_A = "a".repeat(40);
const SECRET_B = "b".repeat(40);

describe("encrypted secrets (D-101)", () => {
  it("reads back what it sealed, never storing it in clear", () => {
    const sealed = encryptSecret("fake-garmin-key-1234", "garmin_api_key", SECRET_A);
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain("fake-garmin-key");
    expect(decryptSecret(sealed, "garmin_api_key", SECRET_A)).toBe("fake-garmin-key-1234");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", "p", SECRET_A)).not.toBe(encryptSecret("same", "p", SECRET_A));
  });

  it("gives null with another AUTH_SECRET, another purpose, or a tampered value", () => {
    const sealed = encryptSecret("fake-key", "garmin_api_key", SECRET_A);
    expect(decryptSecret(sealed, "garmin_api_key", SECRET_B)).toBeNull();
    expect(decryptSecret(sealed, "other", SECRET_A)).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptSecret(parts.join("."), "garmin_api_key", SECRET_A)).toBeNull();
    expect(decryptSecret("garbage", "garmin_api_key", SECRET_A)).toBeNull();
  });
});
