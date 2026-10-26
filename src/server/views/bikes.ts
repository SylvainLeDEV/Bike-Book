import "server-only";
import { localDateOf, type LocalDate } from "@/lib/format";
import type {
  BikeCardVM,
  BikeFormVM,
  BikePageVM,
  BikeRef,
  BikesPageVM,
  ReplacePartVM,
  TotalCostVM,
} from "@/lib/view-models";
import { getBike, listBikes, type AccessContext, type Bike } from "@/server/db";
import { isListedFirst } from "@/server/domain/bikes";
import { computeTotalCost } from "@/server/domain/cost";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";

// Bike view models for the real pages, built from the data-access layer and the domain
// functions. Same shapes as the /design fixtures. Rides, rules, components and photos come
// with the next features: until then their lists are empty.

/** No photo yet (feature 10): the placeholder art, one palette per bike. */
export function bikeRef(bike: Pick<Bike, "id" | "name">): BikeRef {
  return { id: bike.id, name: bike.name, cover: { photoUrl: null, artIndex: bike.id - 1 } };
}

export function bikeCard(bike: Bike): BikeCardVM {
  return {
    bike: bikeRef(bike),
    discipline: bike.discipline,
    isElectric: bike.isElectric,
    status: bike.status,
    statusChangedOn: bike.statusChangedOn,
    monthDistanceM: 0,
    monthDurationS: 0,
    alert: null,
  };
}

export function getBikesPageVM(ctx: AccessContext): BikesPageVM {
  const bikes = listBikes(ctx);
  return {
    active: bikes.filter((bike) => isListedFirst(bike.status)).map(bikeCard),
    others: bikes.filter((bike) => !isListedFirst(bike.status)).map(bikeCard),
  };
}

/** The bike sheet's current values. */
export function bikeForm(bike: Bike): BikeFormVM {
  return {
    id: bike.id,
    name: bike.name,
    brand: bike.brand,
    model: bike.model,
    modelYear: bike.modelYear,
    discipline: bike.discipline,
    isElectric: bike.isElectric,
    status: bike.status,
    statusChangedOn: bike.statusChangedOn,
    soldOn: bike.status === "sold" ? bike.statusChangedOn : null,
    salePriceCents: bike.salePriceCents,
    frameSize: bike.frameSize,
    wheelSize: bike.wheelSize,
    color: bike.color,
    weightG: bike.weightG,
    frameSerial: bike.frameSerial,
    notes: bike.notes,
    purchasedOn: bike.purchasedOn,
    purchasePriceCents: bike.purchasePriceCents,
    shop: bike.purchaseShop ? { name: bike.purchaseShop.name, kind: bike.purchaseShop.kind } : null,
    boughtUsed: bike.boughtUsed,
    initialDistanceM: bike.initialDistanceM,
    initialWearS: bike.initialWearS,
  };
}

/** Maintenance events and rides join the computation with features 4, 5 and 11. */
function totalCost(bike: Bike): TotalCostVM {
  return computeTotalCost({
    purchasePriceCents: bike.purchasePriceCents,
    salePriceCents: bike.status === "sold" ? bike.salePriceCents : null,
    events: [],
    riddenDistanceM: 0,
    rideCount: 0,
  });
}

export type BikePage = { vm: BikePageVM; form: BikeFormVM; replace: ReplacePartVM };

/** Everything the bike page shows, or null when the bike is not in the workspace. */
export function getBikePage(ctx: AccessContext, bikeId: number): BikePage | null {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const ref = bikeRef(bike);
  const trackedSince: LocalDate =
    bike.purchasedOn ?? localDateOf(bike.createdAt.getTime(), getEnv().timeZone);

  const vm: BikePageVM = {
    today: today(),
    bike: {
      ...ref,
      brand: bike.brand,
      model: bike.model,
      modelYear: bike.modelYear,
      frameSize: bike.frameSize,
      discipline: bike.discipline,
      isElectric: bike.isElectric,
      status: bike.status,
    },
    stats: {
      distanceM: bike.initialDistanceM,
      wearS: bike.initialWearS,
      rideCount: 0,
      daysSinceLastMaintenance: null,
      trackedSince,
    },
    rules: [],
    tasks: [],
    components: { purchasedOn: bike.purchasedOn, groups: [] },
    stock: { rows: [], total: 0, toRebuy: 0 },
    history: [],
    record: {
      identity: {
        brand: bike.brand,
        model: bike.model,
        modelYear: bike.modelYear,
        discipline: bike.discipline,
        frameSize: bike.frameSize,
        wheelSize: bike.wheelSize,
        color: bike.color,
        weightG: bike.weightG,
        isElectric: bike.isElectric,
      },
      purchase: {
        purchasedOn: bike.purchasedOn,
        priceCents: bike.purchasePriceCents,
        shop: bike.purchaseShop
          ? { name: bike.purchaseShop.name, kind: bike.purchaseShop.kind }
          : null,
        boughtUsed: bike.boughtUsed,
        initialDistanceM: bike.initialDistanceM,
        initialWearS: bike.initialWearS,
      },
      frameSerial: bike.frameSerial,
      documents: [],
      status: bike.status,
      statusChangedOn: bike.statusChangedOn,
      cost: totalCost(bike),
    },
    photos: [],
  };
  return { vm, form: bikeForm(bike), replace: { bike: ref, slots: [], stock: [] } };
}
