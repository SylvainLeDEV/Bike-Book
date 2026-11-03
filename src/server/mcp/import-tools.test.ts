import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/format";
import { issueToken } from "@/server/auth/tokens";
import { createBike, listRides, type AccessContext, type BikeData } from "@/server/db";
import { today } from "@/server/time";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// The import of D-97 through the real route: create_rides (all or nothing, duplicates, rides
// before the purchase, initial counters) and delete_rides (its undo); the workspace boundary.

function garage(name: string): { ctx: AccessContext; token: string } {
  const ctx = createTestContext(name);
  return { ctx, token: issueToken(ctx, "Tests").token };
}

const BIKE: BikeData = {
  name: "Gravel",
  discipline: "gravel",
  isElectric: false,
  brand: "Origine",
  model: "Graxx",
  modelYear: 2021,
  frameSize: "M",
  wheelSize: "700c",
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: "2021-05-02",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2021-05-02",
  salePriceCents: null,
  notes: null,
};

function addBike(ctx: AccessContext, fields: Partial<BikeData> = {}): number {
  const outcome = createBike(ctx, { ...BIKE, ...fields });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.bikeId;
}

const ride = (bikeId: number, daysAgo: number, fields: Record<string, unknown> = {}) => ({
  bike_id: bikeId,
  on: addDays(today(), -daysAgo),
  ride_type: "gravel",
  duration_s: 3600,
  distance_m: 25_000,
  ...fields,
});

afterEach(() => vi.restoreAllMocks());

describe("create_rides", () => {
  it("previews, then writes a batch on several bikes with each bike's totals", async () => {
    const { ctx, token } = garage("Import");
    const gravel = addBike(ctx);
    const road = addBike(ctx, { name: "Route", discipline: "road" });
    await callTool(token, "add_rule", {
      bike_id: gravel,
      title: "Révision",
      interval_distance_m: 55_000, // 50 km of 55: 91 %, due soon
      dry_run: false,
    });
    const rides = [
      ride(gravel, 10),
      ride(gravel, 5, { start_time: "08:30" }),
      ride(road, 3, { ride_type: "road", distance_m: 80_000 }),
    ];

    const preview = await callTool(token, "create_rides", { rides, dry_run: true });
    expect(preview.isError).toBeUndefined();
    expect(preview.structuredContent).toMatchObject({
      created_count: 3,
      ride_ids: null,
      bikes: [
        {
          bike_id: gravel,
          name: "Gravel",
          before: { ride_count: 0 },
          after: { ride_count: 2, distance_m: 50_000 },
        },
        { bike_id: road, name: "Route", after: { ride_count: 1, distance_m: 80_000 } },
      ],
      rules_made_due: [expect.objectContaining({ title: "Révision", status: "due_soon" })],
      warnings: [expect.stringMatching(/became|would become/)],
    });
    // before and after have the same shape (D-100): the bike is named once.
    const [first] = preview.structuredContent.bikes;
    expect(first.after).toEqual({ ride_count: 2, distance_m: 50_000, wear_time_s: 7200 });
    expect(Object.keys(first.after)).toEqual(Object.keys(first.before));
    expect(listRides(ctx)).toEqual([]);

    const written = await callTool(token, "create_rides", { rides, dry_run: false });
    expect(written.structuredContent.ride_ids).toHaveLength(3);
    expect(listRides(ctx).map((r) => r.source)).toEqual(["manual", "manual", "manual"]);
  });

  it("is all or nothing: one ride refused refuses the batch, named by its index", async () => {
    const { ctx, token } = garage("Refused");
    const gravel = addBike(ctx);
    const answer = await callTool(token, "create_rides", {
      rides: [
        { ...ride(gravel, 0), on: "2021-04-30" },
        ride(gravel, 2, { duration_s: null }),
        ride(gravel, 1, { runs_count: 4 }),
        ride(gravel + 999, 1),
      ],
      dry_run: false,
    });
    expect(answer.isError).toBe(true);
    expect(answer.structuredContent.errors).toEqual([
      { field: "rides[0].on", message: expect.stringMatching(/^Avant l'achat du vélo/) },
      { field: "rides[1].duration_s", message: "Indique une durée, même approximative." },
      { field: "rides[2].runs_count", message: "Seulement pour une journée en bike park." },
      { field: "rides[3].bike_id", message: "Vélo introuvable." },
    ]);
    expect(listRides(ctx)).toEqual([]);
  });

  it("warns about duplicates, and skips those already in the app on request", async () => {
    const { ctx, token } = garage("Duplicates");
    const gravel = addBike(ctx);
    const existing = await callTool(token, "create_ride", { ...ride(gravel, 4), dry_run: false });
    const rides = [ride(gravel, 4), ride(gravel, 2), ride(gravel, 2, { distance_m: 10_000 })];

    const warned = await callTool(token, "create_rides", { rides, dry_run: true });
    expect(warned.structuredContent.warnings).toEqual([
      expect.stringMatching(
        /1 ride\(s\) start within 30 minutes of a ride already in the app \(rides\[0\]\)/,
      ),
      expect.stringMatching(/another ride of the batch on the same bike \(rides\[2\]\)/),
    ]);

    const skipped = await callTool(token, "create_rides", {
      rides,
      skip_duplicates: true,
      dry_run: false,
    });
    expect(skipped.structuredContent).toMatchObject({
      created_count: 2,
      skipped: [
        { index: 0, reason: "duplicate", matching_ride_id: existing.structuredContent.ride.id },
      ],
    });
    expect(listRides(ctx, { bikeId: gravel })).toHaveLength(3);
  });

  it("warns when the bike or its parts have counters from before tracking", async () => {
    const { ctx, token } = garage("Counters");
    const gravel = addBike(ctx, { initialDistanceM: 2_000_000 });
    const answer = await callTool(token, "create_rides", {
      rides: [ride(gravel, 30)],
      dry_run: true,
    });
    expect(answer.structuredContent.warnings).toEqual([
      expect.stringMatching(/Initial counters on Gravel \(2000 km before tracking\)/),
    ]);
    expect(answer.structuredContent.bikes[0]).toMatchObject({
      before: { distance_m: 2_000_000 },
      after: { distance_m: 2_025_000 },
    });
  });
});

describe("delete_rides", () => {
  it("undoes an import: a dry run, then every ride at once, or none", async () => {
    const { ctx, token } = garage("Undo");
    const gravel = addBike(ctx);
    const created = await callTool(token, "create_rides", {
      rides: [ride(gravel, 3), ride(gravel, 2), ride(gravel, 1)],
      dry_run: false,
    });
    const ids = created.structuredContent.ride_ids as number[];

    const preview = await callTool(token, "delete_rides", { ride_ids: ids, dry_run: true });
    expect(preview.structuredContent).toMatchObject({
      ride_count: 3,
      distance_m: 75_000,
      first_on: addDays(today(), -3),
      last_on: addDays(today(), -1),
      bikes: [{ id: gravel, name: "Gravel" }],
    });
    expect(listRides(ctx)).toHaveLength(3);

    const unknown = await callTool(token, "delete_rides", {
      ride_ids: [ids[0], 999_999],
      dry_run: false,
    });
    expect(unknown.structuredContent.errors).toEqual([
      { field: "ride_ids[1]", message: "Sortie introuvable." },
    ]);
    expect(listRides(ctx)).toHaveLength(3);

    await callTool(token, "delete_rides", { ride_ids: ids, dry_run: false });
    expect(listRides(ctx)).toEqual([]);
  });
});

describe("workspace boundary and logs (D-97 tools)", () => {
  it("a token of workspace A imports to and deletes nothing of workspace B", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx);
    const bobRide = await callTool(b.token, "create_ride", { ...ride(bobBike, 1), dry_run: false });
    const imported = await callTool(a.token, "create_rides", {
      rides: [ride(bobBike, 2)],
      dry_run: false,
    });
    expect(imported.structuredContent.errors[0].field).toBe("rides[0].bike_id");
    const deleted = await callTool(a.token, "delete_rides", {
      ride_ids: [bobRide.structuredContent.ride.id],
      dry_run: false,
    });
    expect(deleted.structuredContent.errors[0].field).toBe("ride_ids[0]");
    expect(listRides(b.ctx)).toHaveLength(1);
  });

  it("logs one line per import with its ride ids, nothing typed", async () => {
    const { ctx, token } = garage("Logger");
    const gravel = addBike(ctx);
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(line));
    await callTool(token, "create_rides", {
      rides: [ride(gravel, 2, { location: "Col secret" }), ride(gravel, 1)],
      dry_run: false,
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      tool: "create_rides",
      ride_ids: [expect.any(Number), expect.any(Number)],
    });
    expect(lines[0]).not.toContain("Col secret");
  });
});
