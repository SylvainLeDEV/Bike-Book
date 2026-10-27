import "server-only";
import type { RideConditions, RideType } from "@/lib/enums";
import { addDays, daysBetween, type LocalDate } from "@/lib/format";
import { rideStartInstant } from "@/server/domain/time";
import type { AccessContext } from "./access-context";
import { createRide } from "./rides";

// The demo garage's rides (fictitious, D-22). The recent ones are those of /design (this month's
// totals of the dashboard cards, Les Gets, Salève, Massif des Bauges); older ones come from a
// seeded generator, so every seed gives the same history. Dates as of the fixtures' today
// (25 October 2026), moved by whole weeks by the seed (D-58).

type DemoRide = {
  bike: string;
  on: LocalDate;
  time?: { hour: number; minute: number };
  rideType: RideType;
  location: string | null;
  km: number;
  /** Moving time, in minutes. */
  movingMin?: number;
  /** Total time, in minutes. */
  totalMin?: number;
  descentMin?: number;
  runs?: number;
  elevationM?: number;
  conditions?: RideConditions;
};

const H = 60;

const RECENT: DemoRide[] = [
  // Spectral: 182 km and 14 h this month.
  {
    bike: "Spectral",
    on: "2026-10-04",
    rideType: "enduro",
    location: "Semnoz",
    km: 42,
    movingMin: 3 * H + 10,
    elevationM: 1480,
    conditions: "wet",
  },
  {
    bike: "Spectral",
    on: "2026-10-10",
    rideType: "trail",
    location: "Salève",
    km: 35,
    movingMin: 2 * H + 20,
    elevationM: 1120,
    conditions: "dry",
  },
  {
    bike: "Spectral",
    on: "2026-10-14",
    rideType: "trail",
    location: "Vuache",
    km: 35,
    movingMin: 2 * H + 20,
    elevationM: 980,
    conditions: "mixed",
  },
  {
    bike: "Spectral",
    on: "2026-10-18",
    rideType: "trail",
    location: "Salève",
    km: 32,
    movingMin: 2 * H + 30,
    elevationM: 1050,
    conditions: "dry",
  },
  {
    bike: "Spectral",
    on: "2026-10-24",
    time: { hour: 9, minute: 30 },
    rideType: "enduro",
    location: "Massif des Bauges",
    km: 38,
    movingMin: 3 * H + 40,
    totalMin: 4 * H + 25,
    elevationM: 1620,
    conditions: "mud",
  },
  // Les Gets: the crash that bent the derailleur and cut the rear tyre (replaced on the 15th).
  {
    bike: "Spectral",
    on: "2026-09-12",
    rideType: "bike_park",
    location: "Les Gets",
    km: 41,
    totalMin: 6 * H,
    descentMin: 2 * H + 10,
    runs: 14,
    conditions: "dust",
  },
  // Le Lourd: 96 km and 7 h this month.
  {
    bike: "Le Lourd",
    on: "2026-10-04",
    rideType: "enduro",
    location: "Semnoz",
    km: 48,
    movingMin: 3 * H + 30,
    elevationM: 1750,
    conditions: "wet",
  },
  {
    bike: "Le Lourd",
    on: "2026-10-17",
    rideType: "enduro",
    location: "Salève",
    km: 48,
    movingMin: 3 * H + 30,
    elevationM: 1690,
    conditions: "dry",
  },
  // Gravel alu: 248 km and 9 h this month.
  {
    bike: "Gravel alu",
    on: "2026-10-03",
    rideType: "gravel",
    location: "Tour du lac",
    km: 70,
    movingMin: 2 * H + 30,
    elevationM: 420,
    conditions: "dry",
  },
  {
    bike: "Gravel alu",
    on: "2026-10-11",
    rideType: "gravel",
    location: "Plaine de l'Ain",
    km: 58,
    movingMin: H + 55,
    elevationM: 310,
    conditions: "dry",
  },
  {
    bike: "Gravel alu",
    on: "2026-10-15",
    rideType: "road",
    location: null,
    km: 58,
    movingMin: H + 50,
    elevationM: 380,
  },
  {
    bike: "Gravel alu",
    on: "2026-10-22",
    rideType: "gravel",
    location: "Boucle du plateau",
    km: 62,
    movingMin: 2 * H + 45,
    elevationM: 640,
  },
];

/** Small deterministic generator (mulberry32): the same history on every seed. */
function generator(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Profile = {
  bike: string;
  from: LocalDate;
  until: LocalDate;
  count: number;
  /** Total distance of the generated rides, in km (the recent ones come on top). */
  totalKm: number;
  kinds: { rideType: RideType; weight: number; kmPerHour: number; mPerKm: number }[];
  places: string[];
};

const PROFILES: Profile[] = [
  {
    bike: "Spectral",
    from: "2024-03-23",
    until: "2026-09-30",
    count: 58,
    // 2 846 km in all on /design, minus this month's and Les Gets.
    totalKm: 2846 - 182 - 41,
    kinds: [
      { rideType: "trail", weight: 0.6, kmPerHour: 13, mPerKm: 32 },
      { rideType: "enduro", weight: 0.4, kmPerHour: 11, mPerKm: 40 },
    ],
    places: ["Salève", "Massif des Bauges", "Semnoz", "Vuache", "Forêt du Jorat"],
  },
  {
    bike: "Le Lourd",
    from: "2025-04-19",
    until: "2026-09-28",
    count: 30,
    totalKm: 1240,
    kinds: [
      { rideType: "enduro", weight: 0.7, kmPerHour: 14, mPerKm: 36 },
      { rideType: "trail", weight: 0.3, kmPerHour: 15, mPerKm: 30 },
    ],
    places: ["Semnoz", "Salève", "Massif des Bauges"],
  },
  {
    bike: "Gravel alu",
    from: "2023-06-03",
    until: "2026-09-27",
    count: 64,
    totalKm: 3980,
    kinds: [
      { rideType: "gravel", weight: 0.75, kmPerHour: 23, mPerKm: 9 },
      { rideType: "road", weight: 0.15, kmPerHour: 27, mPerKm: 8 },
      { rideType: "commute", weight: 0.1, kmPerHour: 21, mPerKm: 4 },
    ],
    places: ["Tour du lac", "Boucle du plateau", "Plaine de l'Ain", "Bords du Rhône"],
  },
];

const CONDITIONS: (RideConditions | null)[] = ["dry", "dry", "dry", "wet", "mud", "dust", null];

function generated(profile: Profile, seed: number): DemoRide[] {
  const random = generator(seed);
  const span = daysBetween(profile.from, profile.until);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const raw = Array.from({ length: profile.count }, (_, index) => {
    const offset = Math.round(((index + random() * 0.8) / profile.count) * span);
    let roll = random();
    const kind = profile.kinds.find((k) => (roll -= k.weight) < 0) ?? profile.kinds[0];
    return { on: addDays(profile.from, Math.min(offset, span)), kind, weight: 0.6 + random() };
  });
  const scale = profile.totalKm / raw.reduce((sum, ride) => sum + ride.weight, 0);
  return raw.map((ride) => {
    const km = Math.round(ride.weight * scale);
    return {
      bike: profile.bike,
      on: ride.on,
      rideType: ride.kind.rideType,
      location: ride.kind.rideType === "commute" ? null : pick(profile.places),
      km,
      movingMin: Math.max(20, Math.round((km / ride.kind.kmPerHour) * 60)),
      elevationM: Math.round(km * ride.kind.mPerKm * (0.8 + random() * 0.4)),
      conditions: pick(CONDITIONS) ?? undefined,
    };
  });
}

/** Adds the demo rides to the demo bikes, through the same data-access function as the app. */
export function seedDemoRides(input: {
  ctx: AccessContext;
  bikes: Map<string, { id: number }>;
  day: (date: LocalDate) => LocalDate;
  timeZone: string;
}): void {
  const { ctx, bikes, day, timeZone } = input;
  const all = [
    ...PROFILES.flatMap((profile, index) => generated(profile, 2026 + index)),
    ...RECENT,
  ];
  for (const ride of all.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))) {
    const bike = bikes.get(ride.bike);
    if (!bike) throw new Error(`Demo ride: no bike ${ride.bike}`);
    const park = ride.rideType === "bike_park";
    const outcome = createRide(ctx, {
      bikeId: bike.id,
      startedAt: rideStartInstant(day(ride.on), ride.time ?? null, timeZone),
      title: null,
      location: ride.location,
      rideType: ride.rideType,
      liftAssisted: park,
      distanceM: ride.km * 1000,
      descentDistanceM: null,
      totalTimeS: ride.totalMin != null ? ride.totalMin * 60 : null,
      movingTimeS: ride.movingMin != null ? ride.movingMin * 60 : null,
      descentTimeS: ride.descentMin != null ? ride.descentMin * 60 : null,
      runsCount: ride.runs ?? null,
      elevationGainM: ride.elevationM ?? null,
      elevationLossM: null,
      conditions: ride.conditions ?? null,
      notes: null,
    });
    if (!outcome.ok) throw new Error(`Demo ride on ${ride.on}: ${outcome.reason}`);
  }
}
