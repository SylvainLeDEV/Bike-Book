import "server-only";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { countUsers, createAuthAdapter } from "@/server/db";
import { getEnv } from "@/server/env";
import { canCreateAccount, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./signup-policy";

const DAY_IN_SECONDS = 60 * 60 * 24;

type AuthOptions = {
  baseURL: string;
  secret: string;
  allowSignup: boolean;
  plugins?: BetterAuthPlugin[];
};

export function createAuth({ baseURL, secret, allowSignup, plugins = [] }: AuthOptions) {
  return betterAuth({
    appName: "Bike-Book",
    baseURL,
    secret,
    database: createAuthAdapter(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    session: {
      expiresIn: 30 * DAY_IN_SECONDS,
      updateAge: DAY_IN_SECONDS,
    },
    databaseHooks: {
      user: {
        create: {
          // Applies to every path that creates a user, including direct calls to the HTTP
          // sign-up endpoint, so the setup screen is not the only gate.
          before: async () => {
            if (!canCreateAccount({ existingUsers: countUsers(), allowSignup })) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is disabled",
                code: "SIGN_UP_DISABLED",
              });
            }
          },
        },
      },
    },
    telemetry: { enabled: false },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/** The application's Better Auth instance, created on first use (not at build time). */
export function getAuth(): Auth {
  if (!auth) {
    const env = getEnv();
    auth = createAuth({
      baseURL: env.publicUrl,
      secret: env.authSecret,
      allowSignup: env.allowSignup,
      // Lets Server Actions set the session cookie. Must stay the last plugin.
      plugins: [nextCookies()],
    });
  }
  return auth;
}
