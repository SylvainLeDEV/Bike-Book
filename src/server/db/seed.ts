import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { addDays, daysBetween, type LocalDate } from "@/lib/format";
import { getEnv } from "@/server/env";
import { today as currentDay } from "@/server/time";
import { findAccessContext } from "./accounts";
import { createBike, type BikeData } from "./bikes";
import { getDb } from "./client";
import { seedDemoParts } from "./demo-garage";
import { seedDemoRides } from "./demo-rides";
import { accounts, memberships, users, workspaces } from "./schema";

/** Fictitious demo account for local development (D-22: never real data). */
export const DEMO_ACCOUNT = {
  name: "Camille Martin",
  email: "demo@example.com",
  password: "demo-password-123",
  workspaceName: "Mon garage",
} as const;

/**
 * The /design fixtures are written for Sunday 25 October 2026. The seed moves every date by a
 * whole number of weeks, so the demo looks like /design on the day it is seeded (weekdays kept).
 */
export const FIXTURES_TODAY: LocalDate = "2026-10-25";

export function weeksShift(today: LocalDate): number {
  return Math.floor(daysBetween(FIXTURES_TODAY, today) / 7) * 7;
}

export type SeedResult = { created: boolean; email: string };

type DemoBike = Omit<BikeData, "statusChangedOn" | "salePriceCents">;

/** The three bikes of /design, with fictitious records (D-22). Dates as of FIXTURES_TODAY. */
const DEMO_BIKES: DemoBike[] = [
  {
    name: "Spectral",
    discipline: "enduro",
    isElectric: false,
    brand: "Canyon",
    model: "Spectral 29 CF",
    modelYear: 2024,
    frameSize: "L",
    wheelSize: "29",
    color: "Bleu nuit mat",
    frameSerial: "CN24 7Q3M 8K41",
    weightG: 15_200,
    purchasedOn: "2024-03-14",
    purchasePriceCents: 429_900,
    purchaseShop: { name: "Rayon Libre", kind: "online" },
    boughtUsed: false,
    initialDistanceM: 0,
    initialWearS: 0,
    status: "active",
    notes: null,
  },
  {
    name: "Le Lourd",
    discipline: "enduro",
    isElectric: true,
    brand: "Orbea",
    model: "Wild H20",
    modelYear: 2025,
    frameSize: "L",
    wheelSize: "29",
    color: "Vert sauge",
    frameSerial: "OR25 W4H2 0C19",
    weightG: 24_800,
    purchasedOn: "2025-04-12",
    purchasePriceCents: 649_900,
    purchaseShop: { name: "Cycles du Lac", kind: "physical" },
    boughtUsed: false,
    initialDistanceM: 0,
    initialWearS: 0,
    status: "active",
    notes: "Moteur Bosch Performance Line CX, batterie 750 Wh.",
  },
  {
    name: "Gravel alu",
    discipline: "gravel",
    isElectric: false,
    brand: "Specialized",
    model: "Diverge E5",
    modelYear: 2022,
    frameSize: "56",
    wheelSize: "700c",
    color: "Gris argile",
    frameSerial: "WSBC 6021 7745",
    weightG: 9_900,
    purchasedOn: "2023-05-20",
    purchasePriceCents: 95_000,
    purchaseShop: null,
    boughtUsed: true,
    initialDistanceM: 1_850_000,
    initialWearS: 85 * 3600,
    status: "active",
    notes: "Acheté d'occasion à un particulier, sans historique d'entretien.",
  },
];

/** Removes the demo user and the workspaces they own (everything below cascades). */
function deleteDemoAccount(userId: string): void {
  const db = getDb();
  db.transaction((tx) => {
    const owned = tx
      .select({ id: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .all()
      .map((row) => row.id);
    if (owned.length) tx.delete(workspaces).where(inArray(workspaces.id, owned)).run();
    tx.delete(users).where(eq(users.id, userId)).run();
  });
}

/**
 * Creates the demo user, their credential account, workspace and owner membership, then the
 * demo data. Does nothing if the demo user exists, unless `reset` (development only: the
 * script refuses to run in production) deletes it first.
 */
export async function seedDemoData(
  options: { reset?: boolean; today?: LocalDate } = {},
): Promise<SeedResult> {
  const db = getDb();
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_ACCOUNT.email))
    .get();
  if (existing && !options.reset) return { created: false, email: DEMO_ACCOUNT.email };
  if (existing) deleteDemoAccount(existing.id);

  // Same password format as Better Auth's own sign-up (credential account, scrypt hash).
  const passwordHash = await hashPassword(DEMO_ACCOUNT.password);
  const userId = randomUUID();

  db.transaction((tx) => {
    tx.insert(users)
      .values({ id: userId, name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email })
      .run();
    tx.insert(accounts)
      .values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: passwordHash,
      })
      .run();
    const workspace = tx
      .insert(workspaces)
      .values({ name: DEMO_ACCOUNT.workspaceName })
      .returning({ id: workspaces.id })
      .get();
    tx.insert(memberships).values({ userId, workspaceId: workspace.id, role: "owner" }).run();
  });

  const ctx = findAccessContext({ id: userId, name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email });
  if (!ctx) throw new Error("The demo workspace was not created");
  const shift = weeksShift(options.today ?? currentDay());
  const day = (date: LocalDate | null) => (date ? addDays(date, shift) : null);

  const bikes = new Map<string, { id: number; purchasedOn: LocalDate }>();
  for (const bike of DEMO_BIKES) {
    const purchasedOn = day(bike.purchasedOn);
    const outcome = createBike(ctx, {
      ...bike,
      purchasedOn,
      statusChangedOn: purchasedOn,
      salePriceCents: null,
    });
    if (!outcome.ok) throw new Error(`Demo bike ${bike.name}: ${outcome.reason}`);
    if (purchasedOn) bikes.set(bike.name, { id: outcome.bikeId, purchasedOn });
  }

  const moved = (date: LocalDate) => addDays(date, shift);
  const { timeZone } = getEnv();
  // Rides first: the demo rules are dated from them.
  seedDemoRides({ ctx, bikes, day: moved, timeZone });
  seedDemoParts({ ctx, bikes, day: moved, now: Date.now(), timeZone });

  return { created: true, email: DEMO_ACCOUNT.email };
}
