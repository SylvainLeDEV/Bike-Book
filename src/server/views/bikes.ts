import "server-only";
import { daysBetween, localDateOf, startOfLocalDay, type LocalDate } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type {
  BikeCardVM,
  BikeFormVM,
  BikePageVM,
  BikesPageVM,
  ComponentFormVM,
  ComponentTypeChoice,
  MaintenanceEditVM,
  MaintenanceFormVM,
  MaintenanceLineInput,
  QuickRideInput,
  ReplacePartVM,
  RuleTemplateChoice,
  RulesSheetVM,
  WearDetailVM,
  ShopOption,
  TaskRowVM,
  TotalCostVM,
} from "@/lib/view-models";
import {
  getBike,
  listBikes,
  listComponents,
  listComponentTypes,
  listMaintenanceEvents,
  listOpenTasks,
  listRides,
  listRuleResets,
  listRules,
  listRuleTemplates,
  listShops,
  type AccessContext,
  type Bike,
  type MaintenanceEvent,
  type Task,
} from "@/server/db";
import { isListedFirst } from "@/server/domain/bikes";
import { computeTotalCost, eventCostCents } from "@/server/domain/cost";
import { rideWear, usageBetween } from "@/server/domain/wear";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { bikeComponents, componentTypeChoices, templateChoices } from "./components";
import {
  donePrefill,
  evaluateBikeRules,
  maintenanceRules,
  partStatuses,
  rulesSheet,
} from "./rules";
import { bikeRef } from "./refs";
import { maintenanceEdit, rideForm, timeline } from "./timeline";
import { bikeStock, loadGarage, stockLine } from "./workshop";

// Bike view models for the real pages, built from the data-access layer and the domain
// functions. Same shapes as the /design fixtures. Photos and documents come with feature 10.

export { bikeRef } from "./refs";

/** A task as "À prévoir" shows it. */
export function taskRow(task: Task, bikes: Pick<Bike, "id" | "name">[]): TaskRowVM {
  const bike = bikes.find((b) => b.id === task.bikeId);
  return { id: task.id, bike: bike ? bikeRef(bike) : null, title: task.title, dueOn: task.dueOn };
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

/** The total cost (D-44) over the bike's maintenance events and the distance of its rides. */
function totalCost(
  bike: Bike,
  events: MaintenanceEvent[],
  rides: { distanceM: number | null }[],
): TotalCostVM {
  return computeTotalCost({
    purchasePriceCents: bike.purchasePriceCents,
    salePriceCents: bike.status === "sold" ? bike.salePriceCents : null,
    events: events.map((event) => ({
      id: event.id,
      on: event.performedOn,
      title: event.title,
      shopName: event.performedBy === "shop" ? (event.shop?.name ?? "Atelier") : null,
      costCents: eventCostCents(event),
    })),
    riddenDistanceM: rides.reduce((sum, ride) => sum + (ride.distanceM ?? 0), 0),
    rideCount: rides.length,
  });
}

export type BikePage = {
  vm: BikePageVM;
  form: BikeFormVM;
  replace: ReplacePartVM;
  maintenance: MaintenanceFormVM;
  /** What the history's entries open (D-70): a ride's sheet values, an event's edit sheet. */
  edits: {
    rides: Record<number, QuickRideInput>;
    maintenance: Record<number, MaintenanceEditVM>;
  };
  /** "C'est fait" on a rule: the maintenance sheet prefilled (D-63). */
  done: Record<number, { title: string; lines: MaintenanceLineInput[] }>;
  rules: RulesSheetVM;
  wear: WearDetailVM;
  components: {
    forms: ComponentFormVM[];
    types: ComponentTypeChoice[];
    /** Templates offered when a part is added (feature 6). */
    templates: RuleTemplateChoice[];
    /** "Montée le" of an original part: the purchase date, else the start of tracking. */
    stockInstalledOn: LocalDate;
    shops: ShopOption[];
  };
};

/** Everything the bike page shows, or null when the bike is not in the workspace. */
export function getBikePage(ctx: AccessContext, bikeId: number): BikePage | null {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const { timeZone } = getEnv();
  const day = today();
  const ref = bikeRef(bike);
  const trackedSince: LocalDate =
    bike.purchasedOn ?? localDateOf(bike.createdAt.getTime(), timeZone);
  const rides = listRides(ctx, { bikeId: bike.id });
  const usage = usageBetween(rides, null, null);
  const events = listMaintenanceEvents(ctx, bike.id);
  const shops = listShops(ctx);
  const components = listComponents(ctx, bike.id);
  const types = listComponentTypes();
  const rules = listRules(ctx, bike.id);
  const rulesInput = {
    bike: {
      id: bike.id,
      name: bike.name,
      trackingStartAt: startOfLocalDay(trackedSince, timeZone),
    },
    rules,
    resets: listRuleResets(ctx, bike.id),
    components,
    types,
    rides,
    now: Date.now(),
    today: day,
    timeZone,
  };
  const evaluated = evaluateBikeRules(rulesInput);
  const workshop = loadGarage(ctx).items;
  for (const entry of evaluated) {
    entry.row.stock = stockLine(entry.rule.componentTypeCode, bike.id, workshop);
  }
  const parts = bikeComponents(
    components,
    types,
    rides,
    timeZone,
    partStatuses(evaluated, components),
  );

  const vm: BikePageVM = {
    today: day,
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
      distanceM: bike.initialDistanceM + usage.distanceM,
      wearS: bike.initialWearS + usage.wearS,
      rideCount: rides.length,
      daysSinceLastMaintenance: events.length ? daysBetween(events[0].performedOn, day) : null,
      trackedSince,
    },
    rules: evaluated.map((entry) => entry.row),
    tasks: listOpenTasks(ctx, bike.id).map((task) => taskRow(task, [bike])),
    components: { purchasedOn: bike.purchasedOn, groups: parts.groups },
    stock: bikeStock(workshop, bike.id),
    history: timeline(rides, events, new Map([[bike.id, bike.name]]), timeZone),
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
      cost: totalCost(bike, events, rides),
    },
    photos: [],
  };
  return {
    vm,
    form: bikeForm(bike),
    replace: {
      today: day,
      bike: ref,
      slots: parts.replaceSlots,
      stock: workshop,
      events: events
        .slice(0, 20)
        .map((event) => ({ id: event.id, on: event.performedOn, title: event.title })),
    },
    maintenance: {
      today: day,
      bike: { id: bike.id, name: bike.name },
      parts: parts.replaceSlots.map((slot) => ({
        id: slot.componentId,
        label: `${slot.label} · ${slot.fitted.model}`,
      })),
      rules: maintenanceRules(rules, components),
      shops,
    },
    edits: {
      rides: Object.fromEntries(rides.map((ride) => [ride.id, rideForm(ride, timeZone)])),
      maintenance: Object.fromEntries(
        events.map((event) => [event.id, maintenanceEdit(event, components)]),
      ),
    },
    done: donePrefill(evaluated, components),
    wear: {
      initialDistanceM: bike.initialDistanceM,
      initialWearS: bike.initialWearS,
      rides: rides.map((ride) => {
        const wear = rideWear(ride);
        return {
          id: ride.id,
          on: localDateOf(ride.startedAt, timeZone),
          title: ride.title ?? ride.location ?? RIDE_TYPE_LABELS[ride.rideType],
          distanceM: wear.distanceM,
          wearS: wear.wearS,
          liftCounting: ride.liftAssisted
            ? ride.descentTimeS != null
              ? "descent"
              : "fallback"
            : null,
        };
      }),
    },
    rules: rulesSheet(rulesInput, evaluated),
    components: {
      forms: parts.forms,
      types: componentTypeChoices(types),
      templates: templateChoices(listRuleTemplates(ctx)),
      stockInstalledOn: trackedSince,
      shops,
    },
  };
}
