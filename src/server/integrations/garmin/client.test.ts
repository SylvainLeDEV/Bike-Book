import { beforeEach, describe, expect, it } from "vitest";
import { zip } from "@/server/export/zip";
import { BASE_URL, fakeGarmin, fakeJwt, garminActivity, pass } from "@/test/garmin";
import { clearGarminTokens, GarminClient, PAGE_SIZE } from "./client";
import { GarminError } from "./errors";

const NOW = Date.parse("2026-11-03T20:00:00Z");

function client(fake: ReturnType<typeof fakeGarmin>, key = "test-key") {
  return new GarminClient({ baseUrl: BASE_URL, key, tokenRefreshMarginS: 3600, deps: fake.deps });
}

async function all(c: GarminClient, startDay = "2026-01-01", minDurationS = 60) {
  const pages = [];
  for await (const page of c.cyclingActivities({ startDay, minDurationS })) pages.push(page);
  return pages;
}

const fail = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a GarminError");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(GarminError);
      return error as GarminError;
    },
  );

beforeEach(() => clearGarminTokens());

describe("tokens", () => {
  it("exchanges the key for the raw JWT body and keeps it while it has more than the margin", async () => {
    let now = NOW;
    const fake = fakeGarmin({ activities: [], now: () => now });
    const c = client(fake);
    const token = await c.token();
    expect(token.split(".")).toHaveLength(3);
    expect(fake.calls[0]).toMatchObject({ method: "POST", auth: "ApiKey test-key" });
    expect(await c.token()).toBe(token);
    // 23 h later: less than an hour left, a new one.
    now += 23 * 3600_000 + 1;
    expect(await c.token()).not.toBe(token);
    expect(fake.calls.filter((call) => call.method === "POST")).toHaveLength(2);
  });

  it("says the key is rejected when the exchange answers 401", async () => {
    const fake = fakeGarmin({ activities: [], validKey: "another" });
    const error = await fail(client(fake).token());
    expect(error.kind).toBe("key_rejected");
    expect(error.userMessage).toMatch(/invalide, expirée ou révoquée/);
    expect(error.message).not.toContain("test-key");
  });

  it("refuses a body that is not a JWT with exp", async () => {
    const fake = fakeGarmin({
      activities: [],
      routes: [(call) => (call.method === "POST" ? new Response(fakeJwt({ iat: 1 })) : pass())],
    });
    expect((await fail(client(fake).token())).kind).toBe("unexpected");
  });
});

describe("activity list", () => {
  it("asks for cycling from the start day, oldest first, page by page until a short page", async () => {
    const activities = Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
      garminActivity(
        `2026-10-${String(1 + (i % 28)).padStart(2, "0")} 08:00:${String(i % 60).padStart(2, "0")}`,
      ),
    );
    const fake = fakeGarmin({ activities, now: () => NOW });
    const pages = await all(client(fake), "2026-10-01", 60);
    expect(pages.map((page) => page.length)).toEqual([PAGE_SIZE, 3]);
    const lists = fake.calls.filter((call) => call.path.includes("activitylist"));
    expect(lists.map((call) => call.params.get("start"))).toEqual(["0", String(PAGE_SIZE)]);
    expect(Object.fromEntries(lists[0].params)).toMatchObject({
      limit: String(PAGE_SIZE),
      activityType: "cycling",
      startDate: "2026-10-01",
      sortOrder: "asc",
      minDuration: "60",
    });
  });

  it("exchanges the key again once on a 401, then gives up with key_rejected", async () => {
    const fake = fakeGarmin({
      activities: [garminActivity("2026-10-02 08:00:00")],
      now: () => NOW,
    });
    const c = client(fake);
    await c.token();
    fake.revokeTokens();
    // The cached token is refused: a new exchange, and the call goes through.
    expect((await all(c)).flat()).toHaveLength(1);
    expect(fake.calls.filter((call) => call.method === "POST")).toHaveLength(2);

    const refusing = fakeGarmin({
      activities: [],
      now: () => NOW,
      routes: [(call) => (call.method === "GET" ? new Response("", { status: 401 }) : pass())],
    });
    clearGarminTokens();
    const error = await fail(all(client(refusing)));
    expect(error.kind).toBe("key_rejected");
    expect(refusing.calls.filter((call) => call.method === "GET")).toHaveLength(2);
  });

  it("waits and retries on 429 (Retry-After) and 5xx", async () => {
    let failures = 2;
    const fake = fakeGarmin({
      activities: [garminActivity("2026-10-02 08:00:00")],
      now: () => NOW,
      routes: [
        (call) => {
          if (call.method !== "GET" || failures === 0) return pass();
          failures--;
          return failures === 1
            ? new Response("", { status: 429, headers: { "retry-after": "5" } })
            : new Response("", { status: 503 });
        },
      ],
    });
    expect((await all(client(fake))).flat()).toHaveLength(1);
    expect(fake.sleeps).toEqual([5000, 4000]);
  });

  it("gives up after four tries on network errors", async () => {
    const fake = fakeGarmin({
      activities: [],
      now: () => NOW,
      routes: [
        (call) => {
          if (call.method === "GET") throw new TypeError("fetch failed");
          return pass();
        },
      ],
    });
    const error = await fail(all(client(fake)));
    expect(error.kind).toBe("unavailable");
    expect(fake.sleeps).toEqual([2000, 4000, 8000]);
  });

  it("refuses an answer that is not a list", async () => {
    const fake = fakeGarmin({
      activities: [],
      now: () => NOW,
      routes: [(call) => (call.method === "GET" ? Response.json({ error: "x" }) : pass())],
    });
    expect((await fail(all(client(fake)))).kind).toBe("unexpected");
  });
});

describe("FIT download", () => {
  it("takes the FIT file out of Garmin's ZIP", async () => {
    const fitBytes = Buffer.alloc(64);
    fitBytes[0] = 14;
    fitBytes.write(".FIT", 8, "latin1");
    const chunks: Uint8Array[] = [];
    for await (const chunk of zip([{ name: "123_ACTIVITY.fit", data: fitBytes }], {
      year: 2026,
      month: 11,
      day: 3,
      hour: 21,
      minute: 54,
      second: 0,
    })) {
      chunks.push(chunk);
    }
    const archive = Buffer.concat(chunks);
    const fake = fakeGarmin({
      activities: [],
      now: () => NOW,
      routes: [
        (call) =>
          call.path.startsWith("/download-service/files/activity/")
            ? new Response(archive, { headers: { "content-type": "application/x-zip-compressed" } })
            : pass(),
      ],
    });
    const fit = await client(fake).fitFile("123");
    expect(fit.name).toBe("123_ACTIVITY.fit");
    expect(fit.data.equals(fitBytes)).toBe(true);
  });

  it("refuses a ZIP without a FIT file", async () => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of zip([{ name: "notes.txt", data: Buffer.from("hello") }], {
      year: 2026,
      month: 11,
      day: 3,
      hour: 21,
      minute: 54,
      second: 0,
    })) {
      chunks.push(chunk);
    }
    const fake = fakeGarmin({
      activities: [],
      now: () => NOW,
      routes: [
        (call) =>
          call.path.startsWith("/download-service/") ? new Response(Buffer.concat(chunks)) : pass(),
      ],
    });
    expect((await fail(client(fake).fitFile("123"))).kind).toBe("unexpected");
  });
});
