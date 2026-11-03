import "server-only";
import { createHash } from "node:crypto";
import type { LocalDate } from "@/lib/format";
import {
  jwtExpiresAt,
  retryDelayMs,
  tokenNeedsRefresh,
  type GarminActivitySummary,
} from "@/server/domain/garmin";
import { GarminError } from "./errors";
import { fitFromZip, FitArchiveError } from "./fit";

// Garmin Connect Personal API client (D-101). Endpoints and parameters as in Garmin's Swagger
// (Verified 2026-11-03) and tried on the owner's account the same day:
// - POST /personalapitoken-service/personal-api/personal-api-key/token, `Authorization: ApiKey`,
//   answers the token itself as the body: a JWT valid 24 h, no refresh token;
// - GET /activitylist-service/activities/search/activities (start, limit, activityType = a
//   parent type, startDate = local day, minDuration = timer seconds, sortOrder);
// - GET /download-service/files/activity/{id}: a ZIP holding the FIT file.
// The key and the tokens are never logged, nor put in an error.

const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const LIST_PATH = "/activitylist-service/activities/search/activities";
const DOWNLOAD_PATH = "/download-service/files/activity";

/** Activities per page (Garmin's default is 99; 500 answered fine). */
export const PAGE_SIZE = 100;
/** A guard against a server that never ends its list: 200 pages of 100 activities. */
const MAX_PAGES = 200;
/** Tries per call for 429, 5xx and network errors (the first one included). */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60_000;
/** Per request. */
const TIMEOUT_MS = 30_000;

export type GarminDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
};

export const defaultDeps: GarminDeps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
};

type CachedToken = { token: string; expiresAt: number };

/**
 * Tokens in memory only, one per key (by its fingerprint, never the key itself): a restart asks
 * for a new one, which the key gives at any time.
 */
const tokenCache = new Map<string, CachedToken>();

/** Forgets every cached token (tests, or a key replaced in Paramètres). */
export function clearGarminTokens(): void {
  tokenCache.clear();
}

function fingerprint(baseUrl: string, key: string): string {
  return createHash("sha256").update(`${baseUrl}\n${key}`).digest("hex");
}

export type GarminClientOptions = {
  baseUrl: string;
  key: string;
  /** A new token is asked for when the cached one has less than this left (seconds). */
  tokenRefreshMarginS: number;
  deps?: GarminDeps;
};

export class GarminClient {
  private readonly deps: GarminDeps;
  private readonly cacheKey: string;

  constructor(private readonly options: GarminClientOptions) {
    this.deps = options.deps ?? defaultDeps;
    this.cacheKey = fingerprint(options.baseUrl, options.key);
  }

  /**
   * One HTTP call, retried on 429, 5xx and network errors (with `Retry-After` when Garmin
   * sends one). Any other answer comes back as it is.
   */
  private async send(path: string, init: RequestInit): Promise<Response> {
    let lastFailure: GarminError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response | null = null;
      try {
        response = await this.deps.fetch(`${this.options.baseUrl}${path}`, {
          ...init,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        lastFailure = new GarminError("unavailable", (error as Error)?.name ?? "network");
      }
      if (response) {
        if (response.status !== 429 && response.status < 500) return response;
        lastFailure = new GarminError(
          response.status === 429 ? "rate_limited" : "unavailable",
          `HTTP ${response.status}`,
        );
        await response.body?.cancel().catch(() => {});
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.deps.sleep(
          retryDelayMs({
            attempt,
            retryAfter: response?.headers.get("retry-after") ?? null,
            now: this.deps.now(),
            baseMs: RETRY_BASE_MS,
            maxMs: RETRY_MAX_MS,
            random: this.deps.random(),
          }),
        );
      }
    }
    throw lastFailure ?? new GarminError("unavailable");
  }

  /** A valid token: the cached one while it has more than the margin left, else a new one. */
  async token({ force = false } = {}): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (
      !force &&
      cached &&
      !tokenNeedsRefresh(cached.expiresAt, this.deps.now(), this.options.tokenRefreshMarginS)
    ) {
      return cached.token;
    }
    tokenCache.delete(this.cacheKey);
    const response = await this.send(TOKEN_PATH, {
      method: "POST",
      headers: { Accept: "*/*", Authorization: `ApiKey ${this.options.key}` },
    });
    if (response.status === 401 || response.status === 403) {
      throw new GarminError("key_rejected", `token HTTP ${response.status}`);
    }
    if (!response.ok) throw new GarminError("unexpected", `token HTTP ${response.status}`);
    const token = (await response.text()).trim();
    const expiresAt = jwtExpiresAt(token);
    if (expiresAt == null) throw new GarminError("unexpected", "token is not a JWT with exp");
    tokenCache.set(this.cacheKey, { token, expiresAt });
    return token;
  }

  /**
   * A GET with the token. On a 401 the token is exchanged again and the call tried once more;
   * a second 401 means Garmin refuses the key.
   */
  private async get(path: string, accept: string): Promise<Response> {
    const call = async (token: string) =>
      this.send(path, {
        method: "GET",
        headers: { Accept: accept, Authorization: `Bearer ${token}` },
      });
    let response = await call(await this.token());
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      response = await call(await this.token({ force: true }));
      if (response.status === 401) throw new GarminError("key_rejected", "HTTP 401 twice");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new GarminError("unexpected", `HTTP ${response.status}`);
    }
    return response;
  }

  /**
   * The cycling activities from `startDay` on (Garmin's local start day, inclusive), oldest
   * first, page by page: an import cut short keeps what it already wrote and the next one goes
   * on from there. Activities shorter than `minDurationS` are left out by Garmin.
   */
  async *cyclingActivities(input: {
    startDay: LocalDate;
    minDurationS: number;
  }): AsyncGenerator<GarminActivitySummary[]> {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        start: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
        // A parent type (Swagger): gravel_cycling, mountain_biking… are its subtypes.
        activityType: "cycling",
        startDate: input.startDay,
        sortOrder: "asc",
        ...(input.minDurationS > 0 ? { minDuration: String(input.minDurationS) } : {}),
      });
      const response = await this.get(`${LIST_PATH}?${params}`, "application/json");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GarminError("unexpected", "list is not JSON");
      }
      if (!Array.isArray(body)) throw new GarminError("unexpected", "list is not an array");
      const activities = body.filter(
        (item): item is GarminActivitySummary =>
          typeof item === "object" && item !== null && typeof item.activityId === "number",
      );
      if (activities.length > 0) yield activities;
      if (body.length < PAGE_SIZE) return;
    }
  }

  /** The activity's FIT file, from Garmin's ZIP. */
  async fitFile(activityId: string): Promise<{ name: string; data: Buffer }> {
    if (!/^\d+$/.test(activityId)) throw new GarminError("unexpected", "bad activity id");
    const response = await this.get(`${DOWNLOAD_PATH}/${activityId}`, "*/*");
    const archive = Buffer.from(await response.arrayBuffer());
    try {
      return fitFromZip(archive);
    } catch (error) {
      if (error instanceof FitArchiveError) throw new GarminError("unexpected", error.message);
      throw error;
    }
  }
}
