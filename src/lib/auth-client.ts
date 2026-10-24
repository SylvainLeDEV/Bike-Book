import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. Sign-in goes through the HTTP endpoint (/api/auth/*) rather
 * than a Server Action so that Better Auth's rate limiting and origin checks apply.
 */
export const authClient = createAuthClient();
