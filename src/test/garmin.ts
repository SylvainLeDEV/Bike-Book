import type { GarminActivitySummary } from "@/server/domain/garmin";
import type { GarminDeps } from "@/server/integrations/garmin/client";

// A fake Garmin Personal API for tests: made-up activities shaped as the real answers seen on
// 2026-11-03 (field names, decimals, zone-less instants), no real id, key or token.

export const BASE_URL = "https://garmin.test";

/** A JWT with the given claims (unsigned: only the payload is read). */
export function fakeJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
}

let nextId = 10_000_000_000;

/** A cycling activity summary; `start` is UTC as "YYYY-MM-DD HH:MM:SS", local = UTC + 1 h. */
export function garminActivity(
  start: string,
  overrides: Partial<GarminActivitySummary> = {},
): GarminActivitySummary {
  const utc = new Date(`${start.replace(" ", "T")}Z`);
  const local = new Date(utc.getTime() + 3600_000).toISOString().slice(0, 19).replace("T", " ");
  return {
    activityId: nextId++,
    activityName: "Sortie gravel",
    startTimeLocal: local,
    startTimeGMT: start,
    activityType: { typeId: 143, typeKey: "gravel_cycling", parentTypeId: 2 },
    distance: 41798.0703125,
    duration: 5821.75,
    movingDuration: 5807.0,
    elapsedDuration: 5955.68212890625,
    elevationGain: 123.0,
    elevationLoss: 125.0,
    averageSpeed: 7.179999828338623,
    locationName: "Village",
    ...overrides,
  };
}

export type FakeCall = {
  method: string;
  path: string;
  params: URLSearchParams;
  auth: string | null;
};

type Route = (call: FakeCall) => Response | Promise<Response>;

/**
 * A fetch that answers like Garmin: the token exchange (a JWT valid 24 h from `now`, for
 * `validKey` only), the activity list (filtered by startDate, paged by start/limit, sorted
 * ascending) and anything `routes` adds first. Records every call.
 */
export function fakeGarmin(input: {
  activities: GarminActivitySummary[];
  validKey?: string;
  now?: () => number;
  routes?: Route[];
}) {
  const calls: FakeCall[] = [];
  const sleeps: number[] = [];
  const now = input.now ?? (() => Date.now());
  let issued = 0;
  const validTokens = new Set<string>();

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const headers = new Headers(init?.headers);
    const call: FakeCall = {
      method: init?.method ?? "GET",
      path: parsed.pathname,
      params: parsed.searchParams,
      auth: headers.get("authorization"),
    };
    calls.push(call);
    for (const route of input.routes ?? []) {
      const answer = await route(call);
      if (answer.status !== 404 || answer.headers.get("x-fake") !== "pass") return answer;
    }
    if (call.path.endsWith("/personal-api-key/token")) {
      if (call.auth !== `ApiKey ${input.validKey ?? "test-key"}`)
        return new Response("", { status: 401 });
      const token = fakeJwt({
        exp: Math.floor(now() / 1000) + 86_400,
        iat: Math.floor(now() / 1000),
        n: ++issued,
      });
      validTokens.add(token);
      return new Response(token, { status: 200 });
    }
    if (!call.auth?.startsWith("Bearer ") || !validTokens.has(call.auth.slice(7))) {
      return new Response("", { status: 401 });
    }
    if (call.path === "/activitylist-service/activities/search/activities") {
      const start = Number(call.params.get("start") ?? 0);
      const limit = Number(call.params.get("limit") ?? 99);
      const startDate = call.params.get("startDate");
      const minDuration = Number(call.params.get("minDuration") ?? 0);
      const list = input.activities
        .filter((a) => !startDate || (a.startTimeLocal ?? "").slice(0, 10) >= startDate)
        .filter((a) => (a.duration ?? 0) >= minDuration)
        .sort((a, b) => (a.startTimeGMT ?? "").localeCompare(b.startTimeGMT ?? ""));
      return Response.json(list.slice(start, start + limit));
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;

  const deps: GarminDeps = {
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now,
    random: () => 0,
  };
  return {
    deps,
    calls,
    sleeps,
    /** Makes every current token invalid, as if Garmin had revoked them. */
    revokeTokens: () => validTokens.clear(),
  };
}

/** A route that passes the call on to the default answers. */
export const pass = () => new Response("", { status: 404, headers: { "x-fake": "pass" } });
