import { isAPIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { countUsers } from "@/server/db";
import { DEMO_ACCOUNT, seedDemoData } from "@/server/db/seed";
import { createAuth } from "./auth";

const baseOptions = { baseURL: "http://localhost:3000", secret: "test-secret-".padEnd(40, "x") };

const signUp = (auth: ReturnType<typeof createAuth>, email: string) =>
  auth.api.signUpEmail({ body: { name: "Rider", email, password: "correct-horse-battery" } });

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (isAPIError(error)) return error.body?.code as string | undefined;
    throw error;
  }
  return undefined;
}

describe("auth", () => {
  it("lets the first account in, then refuses sign-up while ALLOW_SIGNUP is off", async () => {
    const auth = createAuth({ ...baseOptions, allowSignup: false });

    const first = await signUp(auth, "first@example.com");
    expect(first.user.email).toBe("first@example.com");

    expect(await errorCode(signUp(auth, "second@example.com"))).toBe("SIGN_UP_DISABLED");
    expect(countUsers()).toBe(1);
  });

  it("accepts further accounts when ALLOW_SIGNUP is on", async () => {
    const auth = createAuth({ ...baseOptions, allowSignup: true });
    await signUp(auth, "third@example.com");
    expect(countUsers()).toBe(2);
  });

  it("enforces the minimum password length", async () => {
    const auth = createAuth({ ...baseOptions, allowSignup: true });
    const tooShort = auth.api.signUpEmail({
      body: { name: "Rider", email: "short@example.com", password: "short" },
    });
    expect(await errorCode(tooShort)).toBe("PASSWORD_TOO_SHORT");
  });

  it("signs in the seeded demo account and rejects a wrong password", async () => {
    const auth = createAuth({ ...baseOptions, allowSignup: false });
    await seedDemoData();

    const session = await auth.api.signInEmail({
      body: { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password },
    });
    expect(session.user.email).toBe(DEMO_ACCOUNT.email);

    const wrong = auth.api.signInEmail({
      body: { email: DEMO_ACCOUNT.email, password: "not-the-password" },
    });
    expect(await errorCode(wrong)).toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});
