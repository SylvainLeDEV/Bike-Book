import { getAuth } from "@/server/auth/auth";

// Better Auth endpoints (sign-in, sign-out, session…). Created lazily so `next build` does not
// need runtime configuration.
function handler(request: Request) {
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
